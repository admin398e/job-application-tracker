"""Running tally program with configurable thresholds.

Reads numbers from stdin and maintains a cumulative total. Positive numbers
add to the total, negative numbers subtract. When the total crosses any of
the configured thresholds, a message is printed.

Usage:
    python running_tally.py
    python running_tally.py --upper 100 --lower -50 --start 0
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field


@dataclass
class Tally:
    total: float = 0.0
    upper_threshold: float | None = None
    lower_threshold: float | None = None
    history: list[float] = field(default_factory=list)

    def apply(self, value: float) -> list[str]:
        """Add value to the total and return any threshold messages triggered."""
        previous = self.total
        self.total += value
        self.history.append(value)

        messages = []
        if (
            self.upper_threshold is not None
            and previous < self.upper_threshold <= self.total
        ):
            messages.append(
                f"Upper threshold reached: total {self.total} >= {self.upper_threshold}"
            )
        if (
            self.lower_threshold is not None
            and previous > self.lower_threshold >= self.total
        ):
            messages.append(
                f"Lower threshold reached: total {self.total} <= {self.lower_threshold}"
            )
        return messages

    def undo(self) -> float | None:
        """Remove the last applied value and return it, or None if empty."""
        if not self.history:
            return None
        last = self.history.pop()
        self.total -= last
        return last


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Maintain a running tally.")
    parser.add_argument("--start", type=float, default=0.0, help="Starting total.")
    parser.add_argument(
        "--upper", type=float, default=None, help="Upper threshold to alert on."
    )
    parser.add_argument(
        "--lower", type=float, default=None, help="Lower threshold to alert on."
    )
    return parser.parse_args(argv)


def run(tally: Tally, prompt: str = "> ") -> None:
    print(f"Starting total: {tally.total}")
    print("Enter a number to add (negative to subtract).")
    print("Commands: 'undo', 'total', 'reset', 'quit'.")

    while True:
        try:
            raw = input(prompt).strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if not raw:
            continue

        command = raw.lower()
        if command in {"quit", "exit", "q"}:
            break
        if command == "total":
            print(f"Total: {tally.total}")
            continue
        if command == "undo":
            last = tally.undo()
            if last is None:
                print("Nothing to undo.")
            else:
                print(f"Undid {last}. Total: {tally.total}")
            continue
        if command == "reset":
            tally.total = 0.0
            tally.history.clear()
            print("Tally reset to 0.")
            continue

        try:
            value = float(raw)
        except ValueError:
            print(f"Not a number or recognized command: {raw!r}")
            continue

        messages = tally.apply(value)
        print(f"Total: {tally.total}")
        for message in messages:
            print(f"  ! {message}")


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    tally = Tally(
        total=args.start,
        upper_threshold=args.upper,
        lower_threshold=args.lower,
    )
    run(tally)


if __name__ == "__main__":
    main()
