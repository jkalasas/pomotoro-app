#!/usr/bin/env python3
import sys
import os
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from evaluation.baselines import TaskData, BASELINE_SCHEDULERS, random_scheduler
from evaluation.metrics import compute_schedule_metrics, cliffs_delta
from evaluation.runner import load_tasks_from_db, load_all_sessions

DB_PATH = Path(__file__).parent.parent / "database.db"


def run_single_session_benchmark(session_id: int, num_runs: int = 30):
    tasks = load_tasks_from_db(str(DB_PATH), session_id)
    if len(tasks) < 3:
        return None

    start_time = datetime.now()
    results = {}

    for name in ["RND", "SPT", "EDD", "WSPT"]:
        scheduler_fn = BASELINE_SCHEDULERS[name]
        if name == "RND":
            metrics_list = []
            for run in range(num_runs):
                scheduled = scheduler_fn(tasks, seed=run * 42)
                m = compute_schedule_metrics(scheduled, start_time)
                metrics_list.append(m)
            results[name] = metrics_list
        else:
            scheduled = scheduler_fn(tasks)
            m = compute_schedule_metrics(scheduled, start_time)
            results[name] = [m]

    return {"session_id": session_id, "task_count": len(tasks), "results": results}


def aggregate_across_sessions(session_results: list) -> dict:
    aggregated = {}

    for alg in ["RND", "SPT", "EDD", "WSPT"]:
        all_twt = []
        all_otr = []
        all_momentum = []
        all_wct = []

        for sr in session_results:
            if sr is None:
                continue
            metrics_list = sr["results"].get(alg, [])
            for m in metrics_list:
                all_twt.append(m.total_weighted_tardiness)
                all_otr.append(m.on_time_rate)
                all_momentum.append(m.momentum_index)
                all_wct.append(m.weighted_completion_time)

        if all_twt:
            aggregated[alg] = {
                "twt_mean": sum(all_twt) / len(all_twt),
                "twt_std": (
                    sum((x - sum(all_twt) / len(all_twt)) ** 2 for x in all_twt)
                    / len(all_twt)
                )
                ** 0.5,
                "otr_mean": sum(all_otr) / len(all_otr),
                "momentum_mean": sum(all_momentum) / len(all_momentum),
                "wct_mean": sum(all_wct) / len(all_wct),
                "n_samples": len(all_twt),
            }

    return aggregated


def print_results_table(aggregated: dict):
    print("\n" + "=" * 80)
    print("BASELINE SCHEDULER COMPARISON RESULTS")
    print("=" * 80)
    print(
        f"\n{'Algorithm':<10} {'TWT (mean±std)':<25} {'OTR':<10} {'Momentum':<12} {'WCT':<15} {'N':<5}"
    )
    print("-" * 80)

    for alg in ["SPT", "EDD", "WSPT", "RND"]:
        if alg in aggregated:
            d = aggregated[alg]
            twt_str = f"{d['twt_mean']:.1f} ± {d['twt_std']:.1f}"
            print(
                f"{alg:<10} {twt_str:<25} {d['otr_mean']:.3f}     {d['momentum_mean']:.3f}       {d['wct_mean']:.1f}       {d['n_samples']}"
            )


def main():
    print(f"Database: {DB_PATH}")
    print(f"Loading sessions...")

    session_ids = load_all_sessions(str(DB_PATH))
    print(f"Found {len(session_ids)} sessions with 3+ tasks")

    print(f"\nRunning baseline benchmarks...")
    session_results = []

    for i, sid in enumerate(session_ids):
        result = run_single_session_benchmark(sid, num_runs=30)
        if result:
            session_results.append(result)
            print(f"  Session {sid}: {result['task_count']} tasks")

    print(f"\nCompleted {len(session_results)} session benchmarks")

    aggregated = aggregate_across_sessions(session_results)
    print_results_table(aggregated)

    print("\n" + "=" * 80)
    print("PAIRWISE COMPARISONS (Improvement Ratio vs RND baseline)")
    print("=" * 80)

    if "RND" in aggregated:
        rnd_twt = aggregated["RND"]["twt_mean"]
        for alg in ["SPT", "EDD", "WSPT"]:
            if alg in aggregated:
                alg_twt = aggregated[alg]["twt_mean"]
                if rnd_twt > 0:
                    ir = ((rnd_twt - alg_twt) / rnd_twt) * 100
                    print(f"  {alg} vs RND: {ir:.1f}% improvement in TWT")

    return aggregated


if __name__ == "__main__":
    main()
