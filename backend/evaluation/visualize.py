#!/usr/bin/env python3
import sys
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass
from typing import List, Dict, Tuple
import sqlite3

import numpy as np
from scipy import stats

sys.path.insert(0, str(Path(__file__).parent.parent))

from evaluation.baselines import TaskData, BASELINE_SCHEDULERS
from evaluation.metrics import compute_schedule_metrics, cliffs_delta, ScheduleMetrics
from evaluation.runner import (
    load_tasks_from_db,
    load_all_sessions,
    run_ga_with_convergence,
)

DB_PATH = Path(__file__).parent.parent / "database.db"
OUTPUT_DIR = Path(__file__).parent / "figures"


@dataclass
class UserCohort:
    name: str
    user_ids: List[int]
    session_ids: List[int]
    completion_rate_range: Tuple[float, float]


@dataclass
class CohortResult:
    cohort: UserCohort
    ga_twt: List[float]
    ga_otr: List[float]
    ga_momentum: List[float]
    baseline_twt: Dict[str, List[float]]
    baseline_otr: Dict[str, List[float]]


@dataclass
class ConvergenceData:
    generations: List[int]
    best_fitness: List[float]
    mean_fitness: List[float]
    std_fitness: List[float]


def load_user_completion_rates(db_path: str) -> Dict[int, float]:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT u.id, 
               COALESCE(SUM(CASE WHEN t.completed = 1 THEN 1 ELSE 0 END), 0) as completed,
               COUNT(t.id) as total
        FROM user u
        LEFT JOIN session s ON s.user_id = u.id AND s.is_deleted = 0
        LEFT JOIN task t ON t.session_id = s.id AND t.is_deleted = 0
        GROUP BY u.id
        HAVING total > 0
    """)

    rates = {}
    for row in cursor.fetchall():
        user_id, completed, total = row
        rates[user_id] = completed / total if total > 0 else 0.0

    conn.close()
    return rates


def load_user_sessions(db_path: str) -> Dict[int, List[int]]:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT s.user_id, s.id
        FROM session s
        JOIN task t ON t.session_id = s.id
        WHERE s.is_deleted = 0 AND t.is_deleted = 0
        GROUP BY s.id
        HAVING COUNT(t.id) >= 3
    """)

    user_sessions: Dict[int, List[int]] = {}
    for row in cursor.fetchall():
        user_id, session_id = row
        if user_id not in user_sessions:
            user_sessions[user_id] = []
        user_sessions[user_id].append(session_id)

    conn.close()
    return user_sessions


def create_user_cohorts(db_path: str) -> List[UserCohort]:
    rates = load_user_completion_rates(db_path)
    user_sessions = load_user_sessions(db_path)

    if not rates:
        return []

    rate_values = list(rates.values())
    p33 = float(np.percentile(rate_values, 33))
    p66 = float(np.percentile(rate_values, 66))

    cohorts = [
        UserCohort(
            name="High Performers",
            user_ids=[],
            session_ids=[],
            completion_rate_range=(p66, 1.0),
        ),
        UserCohort(
            name="Medium Performers",
            user_ids=[],
            session_ids=[],
            completion_rate_range=(p33, p66),
        ),
        UserCohort(
            name="Low Performers",
            user_ids=[],
            session_ids=[],
            completion_rate_range=(0.0, p33),
        ),
    ]

    for user_id, rate in rates.items():
        if rate >= p66:
            cohorts[0].user_ids.append(user_id)
            cohorts[0].session_ids.extend(user_sessions.get(user_id, []))
        elif rate >= p33:
            cohorts[1].user_ids.append(user_id)
            cohorts[1].session_ids.extend(user_sessions.get(user_id, []))
        else:
            cohorts[2].user_ids.append(user_id)
            cohorts[2].session_ids.extend(user_sessions.get(user_id, []))

    return cohorts


def run_cohort_evaluation(
    db_path: str, cohort: UserCohort, num_ga_runs: int = 10, num_rnd_runs: int = 30
) -> CohortResult:
    ga_twt: List[float] = []
    ga_otr: List[float] = []
    ga_momentum: List[float] = []
    baseline_twt: Dict[str, List[float]] = {"RND": [], "SPT": [], "EDD": [], "WSPT": []}
    baseline_otr: Dict[str, List[float]] = {"RND": [], "SPT": [], "EDD": [], "WSPT": []}

    for session_id in cohort.session_ids:
        tasks = load_tasks_from_db(db_path, session_id)
        if len(tasks) < 3:
            continue

        start_time = datetime.now()

        for run in range(num_ga_runs):
            try:
                scheduled, fitness, _ = run_ga_with_convergence(tasks, seed=run * 42)
                m = compute_schedule_metrics(scheduled, start_time)
                ga_twt.append(m.total_weighted_tardiness)
                ga_otr.append(m.on_time_rate)
                ga_momentum.append(m.momentum_index)
            except Exception:
                continue

        for name in ["RND", "SPT", "EDD", "WSPT"]:
            scheduler_fn = BASELINE_SCHEDULERS[name]
            if name == "RND":
                for run in range(num_rnd_runs):
                    scheduled = scheduler_fn(tasks, seed=run * 42)
                    m = compute_schedule_metrics(scheduled, start_time)
                    baseline_twt[name].append(m.total_weighted_tardiness)
                    baseline_otr[name].append(m.on_time_rate)
            else:
                scheduled = scheduler_fn(tasks)
                m = compute_schedule_metrics(scheduled, start_time)
                baseline_twt[name].append(m.total_weighted_tardiness)
                baseline_otr[name].append(m.on_time_rate)

    return CohortResult(
        cohort=cohort,
        ga_twt=ga_twt,
        ga_otr=ga_otr,
        ga_momentum=ga_momentum,
        baseline_twt=baseline_twt,
        baseline_otr=baseline_otr,
    )


def collect_convergence_data(
    db_path: str, num_sessions: int = 5, num_runs: int = 5
) -> ConvergenceData:
    session_ids = load_all_sessions(db_path)[:num_sessions]

    all_histories: List[List[float]] = []

    for sid in session_ids:
        tasks = load_tasks_from_db(db_path, sid)
        if len(tasks) < 3:
            continue

        print(f"  Convergence: Session {sid} ({len(tasks)} tasks)")

        for run in range(num_runs):
            try:
                _, _, history = run_ga_with_convergence(tasks, seed=run * 42)
                if history:
                    all_histories.append(history)
            except Exception as e:
                print(f"    Run {run} failed: {e}")

    if not all_histories:
        return ConvergenceData([], [], [], [])

    min_len = min(len(h) for h in all_histories)
    aligned = [h[:min_len] for h in all_histories]

    generations = list(range(1, min_len + 1))
    arr = np.array(aligned)

    return ConvergenceData(
        generations=generations,
        best_fitness=np.max(arr, axis=0).tolist(),
        mean_fitness=np.mean(arr, axis=0).tolist(),
        std_fitness=np.std(arr, axis=0).tolist(),
    )


def print_ascii_bar(label: str, value: float, max_value: float, width: int = 40):
    if max_value == 0:
        bar_len = 0
    else:
        bar_len = int((value / max_value) * width)
    bar = "█" * bar_len + "░" * (width - bar_len)
    print(f"  {label:15} │{bar}│ {value:.1f}")


def print_comparison_chart(stats_data: Dict[str, Dict[str, List[float]]]):
    print("\n" + "=" * 70)
    print("ALGORITHM COMPARISON - TOTAL WEIGHTED TARDINESS (lower is better)")
    print("=" * 70)

    twt_means = {}
    for alg in ["GA", "SPT", "EDD", "WSPT", "RND"]:
        if stats_data[alg]["twt"]:
            twt_means[alg] = float(np.mean(stats_data[alg]["twt"]))

    max_twt = max(twt_means.values()) if twt_means else 1

    for alg in ["EDD", "SPT", "WSPT", "GA", "RND"]:
        if alg in twt_means:
            print_ascii_bar(alg, twt_means[alg], max_twt)

    print("\n" + "=" * 70)
    print("ALGORITHM COMPARISON - ON-TIME RATE (higher is better)")
    print("=" * 70)

    for alg in ["WSPT", "RND", "SPT", "EDD", "GA"]:
        if stats_data[alg]["otr"]:
            otr_mean = float(np.mean(stats_data[alg]["otr"]))
            print_ascii_bar(alg, otr_mean * 100, 100, 40)


def print_convergence_chart(data: ConvergenceData):
    if not data.generations:
        print("No convergence data available.")
        return

    print("\n" + "=" * 70)
    print("GA CONVERGENCE CURVE")
    print("=" * 70)

    step = max(1, len(data.generations) // 8)

    max_fitness = max(data.mean_fitness) if data.mean_fitness else 1
    min_fitness = min(data.mean_fitness) if data.mean_fitness else 0
    range_fitness = max_fitness - min_fitness or 1

    print(f"{'Gen':>6} │ Fitness (Mean ± Std)")
    print("-" * 50)

    for i in range(0, len(data.generations), step):
        gen = data.generations[i]
        mean = data.mean_fitness[i]
        std = data.std_fitness[i]

        normalized = int(((mean - min_fitness) / range_fitness) * 30)
        bar = "▓" * normalized + "░" * (30 - normalized)

        print(f"{gen:>6} │ {bar} {mean:.4f} ± {std:.4f}")

    if len(data.generations) > 0:
        print("-" * 50)
        print(
            f"{'Final':>6} │ Best: {data.best_fitness[-1]:.4f}, Mean: {data.mean_fitness[-1]:.4f}"
        )


def print_cohort_comparison(results: List[CohortResult]):
    print("\n" + "=" * 90)
    print("USER COHORT ANALYSIS")
    print("=" * 90)

    print(
        f"\n{'Cohort':<20} {'Users':<8} {'Sessions':<10} {'GA TWT':<15} {'vs RND':<12} {'Effect':<12}"
    )
    print("-" * 90)

    for r in results:
        if not r.ga_twt or not r.baseline_twt["RND"]:
            continue

        ga_mean = float(np.mean(r.ga_twt))
        rnd_mean = float(np.mean(r.baseline_twt["RND"]))

        if rnd_mean > 0:
            ir = ((rnd_mean - ga_mean) / rnd_mean) * 100
        else:
            ir = 0

        delta, effect = cliffs_delta(r.baseline_twt["RND"], r.ga_twt)

        print(
            f"{r.cohort.name:<20} {len(r.cohort.user_ids):<8} {len(r.cohort.session_ids):<10} "
            f"{ga_mean:<15.1f} {ir:>+10.1f}% {effect:<12}"
        )


def try_generate_figures(
    stats_data: Dict[str, Dict[str, List[float]]],
    convergence: ConvergenceData,
    cohort_results: List[CohortResult],
    output_dir: Path,
):
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        output_dir.mkdir(parents=True, exist_ok=True)

        fig, ax = plt.subplots(figsize=(10, 6))

        data = []
        labels = []
        for alg in ["EDD", "SPT", "WSPT", "GA", "RND"]:
            if stats_data[alg]["twt"]:
                data.append(stats_data[alg]["twt"])
                labels.append(alg)

        bp = ax.boxplot(data, tick_labels=labels, patch_artist=True)

        colors = ["#2ecc71", "#3498db", "#9b59b6", "#e74c3c", "#95a5a6"]
        for patch, color in zip(bp["boxes"], colors):
            patch.set_facecolor(color)
            patch.set_alpha(0.7)

        ax.set_ylabel("Total Weighted Tardiness (minutes)")
        ax.set_xlabel("Scheduling Algorithm")
        ax.set_title("Algorithm Comparison: Total Weighted Tardiness")
        ax.grid(True, alpha=0.3)

        plt.tight_layout()
        plt.savefig(output_dir / "algorithm_comparison_twt.png", dpi=150)
        plt.close()
        print(f"  Saved: {output_dir / 'algorithm_comparison_twt.png'}")

        if convergence.generations:
            fig, ax = plt.subplots(figsize=(10, 6))

            generations = convergence.generations
            mean = np.array(convergence.mean_fitness)
            std = np.array(convergence.std_fitness)

            ax.plot(generations, mean, "b-", linewidth=2, label="Mean Fitness")
            ax.fill_between(
                generations, mean - std, mean + std, alpha=0.3, color="blue"
            )
            ax.plot(
                generations,
                convergence.best_fitness,
                "g--",
                linewidth=1,
                label="Best Fitness",
            )

            ax.set_xlabel("Generation")
            ax.set_ylabel("Fitness Score")
            ax.set_title("GA Convergence Curve")
            ax.legend()
            ax.grid(True, alpha=0.3)

            plt.tight_layout()
            plt.savefig(output_dir / "ga_convergence.png", dpi=150)
            plt.close()
            print(f"  Saved: {output_dir / 'ga_convergence.png'}")

        if cohort_results:
            fig, ax = plt.subplots(figsize=(10, 6))

            cohort_names = []
            ga_means = []
            rnd_means = []

            for r in cohort_results:
                if r.ga_twt and r.baseline_twt["RND"]:
                    cohort_names.append(r.cohort.name)
                    ga_means.append(float(np.mean(r.ga_twt)))
                    rnd_means.append(float(np.mean(r.baseline_twt["RND"])))

            if cohort_names:
                x = np.arange(len(cohort_names))
                width = 0.35

                ax.bar(
                    x - width / 2,
                    ga_means,
                    width,
                    label="GA",
                    color="#e74c3c",
                    alpha=0.8,
                )
                ax.bar(
                    x + width / 2,
                    rnd_means,
                    width,
                    label="Random",
                    color="#95a5a6",
                    alpha=0.8,
                )

                ax.set_ylabel("Mean Total Weighted Tardiness")
                ax.set_xlabel("User Cohort")
                ax.set_title("GA vs Random Performance by User Cohort")
                ax.set_xticks(x)
                ax.set_xticklabels(cohort_names)
                ax.legend()
                ax.grid(True, alpha=0.3, axis="y")

                plt.tight_layout()
                plt.savefig(output_dir / "cohort_comparison.png", dpi=150)
                plt.close()
                print(f"  Saved: {output_dir / 'cohort_comparison.png'}")

        fig, axes = plt.subplots(1, 3, figsize=(15, 5))

        metrics = [
            ("twt", "Total Weighted Tardiness", True),
            ("otr", "On-Time Rate", False),
            ("momentum", "Momentum Index", False),
        ]

        for ax, (metric, title, lower_better) in zip(axes, metrics):
            values = []
            labels = []
            for alg in ["GA", "SPT", "EDD", "WSPT", "RND"]:
                if stats_data[alg][metric]:
                    values.append(float(np.mean(stats_data[alg][metric])))
                    labels.append(alg)

            colors = ["#e74c3c", "#3498db", "#2ecc71", "#9b59b6", "#95a5a6"]
            bars = ax.bar(labels, values, color=colors[: len(labels)], alpha=0.8)

            ax.set_title(title)
            ax.grid(True, alpha=0.3, axis="y")

            if values:
                best_idx = np.argmin(values) if lower_better else np.argmax(values)
                bars[best_idx].set_edgecolor("black")
                bars[best_idx].set_linewidth(2)

        plt.tight_layout()
        plt.savefig(output_dir / "multi_metric_comparison.png", dpi=150)
        plt.close()
        print(f"  Saved: {output_dir / 'multi_metric_comparison.png'}")

        return True

    except ImportError:
        print("  matplotlib not available - skipping figure generation")
        return False


def main():
    print("=" * 70)
    print("POMOTORO GA VISUALIZATION & COHORT ANALYSIS")
    print("=" * 70)

    print("\n[1/4] Running full evaluation...")
    from evaluation.run_full_evaluation import (
        run_full_evaluation,
        compute_aggregate_stats,
    )

    results = run_full_evaluation(num_ga_runs=10, num_rnd_runs=30)
    if not results:
        print("No results!")
        return

    stats_data = compute_aggregate_stats(results)

    for alg in ["GA", "SPT", "EDD", "WSPT", "RND"]:
        if "momentum" not in stats_data[alg]:
            stats_data[alg]["momentum"] = []

    for r in results:
        for m in r.ga_metrics:
            stats_data["GA"]["momentum"].append(m.momentum_index)
        for alg in ["RND", "SPT", "EDD", "WSPT"]:
            for m in r.baseline_metrics.get(alg, []):
                stats_data[alg]["momentum"].append(m.momentum_index)

    print("\n[2/4] Collecting convergence data...")
    convergence = collect_convergence_data(str(DB_PATH), num_sessions=5, num_runs=5)

    print("\n[3/4] Running user cohort analysis...")
    cohorts = create_user_cohorts(str(DB_PATH))

    cohort_results = []
    for cohort in cohorts:
        if cohort.session_ids:
            print(
                f"  Evaluating: {cohort.name} ({len(cohort.user_ids)} users, "
                f"{len(cohort.session_ids)} sessions)"
            )
            result = run_cohort_evaluation(
                str(DB_PATH), cohort, num_ga_runs=5, num_rnd_runs=10
            )
            cohort_results.append(result)

    print("\n[4/4] Generating outputs...")

    print_comparison_chart(stats_data)
    print_convergence_chart(convergence)
    print_cohort_comparison(cohort_results)

    print("\nGenerating figures...")
    try_generate_figures(stats_data, convergence, cohort_results, OUTPUT_DIR)

    print("\n" + "=" * 70)
    print("ANALYSIS COMPLETE")
    print("=" * 70)

    if convergence.mean_fitness:
        print(f"\nConvergence: {len(convergence.generations)} generations tracked")
        print(f"  Initial fitness: {convergence.mean_fitness[0]:.4f}")
        print(f"  Final fitness:   {convergence.mean_fitness[-1]:.4f}")
        improvement = (
            (
                (convergence.mean_fitness[-1] - convergence.mean_fitness[0])
                / convergence.mean_fitness[0]
                * 100
            )
            if convergence.mean_fitness[0] != 0
            else 0
        )
        print(f"  Improvement:     {improvement:+.1f}%")

    print(f"\nCohorts analyzed: {len(cohort_results)}")
    for r in cohort_results:
        if r.ga_twt:
            print(
                f"  {r.cohort.name}: {len(r.cohort.user_ids)} users, GA mean TWT = {np.mean(r.ga_twt):.1f}"
            )


if __name__ == "__main__":
    main()
