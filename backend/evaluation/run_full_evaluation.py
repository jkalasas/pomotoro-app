#!/usr/bin/env python3
import sys
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass
from typing import List

import numpy as np
from scipy import stats

sys.path.insert(0, str(Path(__file__).parent.parent))

from evaluation.baselines import TaskData, BASELINE_SCHEDULERS
from evaluation.metrics import compute_schedule_metrics, cliffs_delta, ScheduleMetrics
from evaluation.runner import (
    load_tasks_from_db,
    load_all_sessions,
    run_ga_scheduler,
)

DB_PATH = Path(__file__).parent.parent / "database.db"


@dataclass
class SessionResult:
    session_id: int
    task_count: int
    ga_metrics: List[ScheduleMetrics]
    ga_fitness: List[float]
    baseline_metrics: dict


def run_full_evaluation(num_ga_runs: int = 30, num_rnd_runs: int = 30):
    print(f"Database: {DB_PATH}")
    session_ids = load_all_sessions(str(DB_PATH))
    print(f"Found {len(session_ids)} sessions with 3+ tasks")

    all_results = []

    for sid in session_ids:
        tasks = load_tasks_from_db(str(DB_PATH), sid)
        if len(tasks) < 3:
            continue

        start_time = datetime.now()

        ga_metrics = []
        ga_fitness_values = []
        print(f"\nSession {sid} ({len(tasks)} tasks):")

        for run in range(num_ga_runs):
            try:
                scheduled, fitness = run_ga_scheduler(tasks, seed=run * 42)
                m = compute_schedule_metrics(scheduled, start_time)
                ga_metrics.append(m)
                ga_fitness_values.append(fitness)
            except Exception as e:
                print(f"  GA run {run} failed: {e}")
                continue

        if not ga_metrics:
            print(f"  Skipped - no successful GA runs")
            continue

        baseline_metrics = {}
        for name in ["RND", "SPT", "EDD", "WSPT"]:
            scheduler_fn = BASELINE_SCHEDULERS[name]
            if name == "RND":
                metrics_list = []
                for run in range(num_rnd_runs):
                    scheduled = scheduler_fn(tasks, seed=run * 42)
                    m = compute_schedule_metrics(scheduled, start_time)
                    metrics_list.append(m)
                baseline_metrics[name] = metrics_list
            else:
                scheduled = scheduler_fn(tasks)
                m = compute_schedule_metrics(scheduled, start_time)
                baseline_metrics[name] = [m]

        result = SessionResult(
            session_id=sid,
            task_count=len(tasks),
            ga_metrics=ga_metrics,
            ga_fitness=ga_fitness_values,
            baseline_metrics=baseline_metrics,
        )
        all_results.append(result)

        ga_twt_mean = np.mean([m.total_weighted_tardiness for m in ga_metrics])
        print(f"  GA TWT: {ga_twt_mean:.1f}")

    return all_results


def compute_aggregate_stats(results: List[SessionResult]):
    algorithms = ["GA", "RND", "SPT", "EDD", "WSPT"]
    stats_data = {
        alg: {"twt": [], "otr": [], "momentum": [], "wct": []} for alg in algorithms
    }

    for r in results:
        for m in r.ga_metrics:
            stats_data["GA"]["twt"].append(m.total_weighted_tardiness)
            stats_data["GA"]["otr"].append(m.on_time_rate)
            stats_data["GA"]["momentum"].append(m.momentum_index)
            stats_data["GA"]["wct"].append(m.weighted_completion_time)

        for alg in ["RND", "SPT", "EDD", "WSPT"]:
            for m in r.baseline_metrics.get(alg, []):
                stats_data[alg]["twt"].append(m.total_weighted_tardiness)
                stats_data[alg]["otr"].append(m.on_time_rate)
                stats_data[alg]["momentum"].append(m.momentum_index)
                stats_data[alg]["wct"].append(m.weighted_completion_time)

    return stats_data


def print_comparison_table(stats_data: dict):
    print("\n" + "=" * 100)
    print("GA vs BASELINE COMPARISON RESULTS")
    print("=" * 100)

    print(
        f"\n{'Algorithm':<10} {'TWT (mean ± std)':<25} {'OTR':<12} {'Momentum':<12} {'WCT':<18} {'N':<6}"
    )
    print("-" * 100)

    for alg in ["GA", "SPT", "EDD", "WSPT", "RND"]:
        twt = stats_data[alg]["twt"]
        otr = stats_data[alg]["otr"]
        mom = stats_data[alg]["momentum"]
        wct = stats_data[alg]["wct"]

        if twt:
            twt_mean = np.mean(twt)
            twt_std = np.std(twt)
            otr_mean = np.mean(otr)
            mom_mean = np.mean(mom)
            wct_mean = np.mean(wct)
            n = len(twt)

            twt_str = f"{twt_mean:.1f} ± {twt_std:.1f}"
            print(
                f"{alg:<10} {twt_str:<25} {otr_mean:.3f}        {mom_mean:.3f}        {wct_mean:.1f}          {n}"
            )


def run_statistical_tests(stats_data: dict):
    print("\n" + "=" * 100)
    print("STATISTICAL TESTS (GA vs each baseline)")
    print("=" * 100)

    ga_twt = stats_data["GA"]["twt"]

    print(
        f"\n{'Comparison':<20} {'GA Mean TWT':<15} {'Baseline TWT':<15} {'IR%':<10} {'Wilcoxon p':<12} {'Cliff δ':<12} {'Effect':<10}"
    )
    print("-" * 100)

    for baseline in ["RND", "SPT", "EDD", "WSPT"]:
        baseline_twt = stats_data[baseline]["twt"]

        if not baseline_twt or not ga_twt:
            continue

        ga_mean = np.mean(ga_twt)
        bl_mean = np.mean(baseline_twt)

        if bl_mean > 0:
            ir = ((bl_mean - ga_mean) / bl_mean) * 100
        else:
            ir = 0

        min_len = min(len(ga_twt), len(baseline_twt))
        ga_sample = ga_twt[:min_len]
        bl_sample = baseline_twt[:min_len]

        try:
            _, p_value = stats.wilcoxon(ga_sample, bl_sample)
            p_value = float(p_value)  # type: ignore[arg-type]
        except Exception:
            p_value = 1.0

        delta, effect = cliffs_delta(bl_sample, ga_sample)

        sig = (
            "***"
            if p_value < 0.001
            else "**"
            if p_value < 0.01
            else "*"
            if p_value < 0.05
            else "ns"
        )

        print(
            f"GA vs {baseline:<14} {ga_mean:<15.1f} {bl_mean:<15.1f} {ir:<10.1f} {p_value:<12.4f} {delta:<12.3f} {effect} {sig}"
        )


def main():
    print("=" * 100)
    print("POMOTORO GA SCHEDULER EVALUATION")
    print("Comparing Genetic Algorithm vs Baseline Schedulers")
    print("=" * 100)

    results = run_full_evaluation(num_ga_runs=10, num_rnd_runs=30)

    if not results:
        print("No results generated!")
        return

    stats_data = compute_aggregate_stats(results)
    print_comparison_table(stats_data)
    run_statistical_tests(stats_data)

    print("\n" + "=" * 100)
    print("IMPROVEMENT SUMMARY")
    print("=" * 100)

    ga_mean = np.mean(stats_data["GA"]["twt"])
    for baseline in ["RND", "SPT", "EDD", "WSPT"]:
        bl_mean = np.mean(stats_data[baseline]["twt"])
        if bl_mean > 0:
            ir = ((bl_mean - ga_mean) / bl_mean) * 100
            print(
                f"  GA vs {baseline}: {ir:.1f}% improvement in Total Weighted Tardiness"
            )

    print("\n" + "=" * 100)
    print("CONVERGENCE ANALYSIS")
    print("=" * 100)

    all_fitness = []
    for r in results:
        all_fitness.extend(r.ga_fitness)

    if all_fitness:
        print(
            f"  Final fitness - Mean: {np.mean(all_fitness):.4f}, Std: {np.std(all_fitness):.4f}"
        )
        print(
            f"  Final fitness - Min: {np.min(all_fitness):.4f}, Max: {np.max(all_fitness):.4f}"
        )


if __name__ == "__main__":
    main()
