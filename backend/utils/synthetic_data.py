from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def _random_choice(rng: np.random.Generator, values: list[str], probabilities: list[float], size: int) -> np.ndarray:
    return rng.choice(values, size=size, p=probabilities)


def generate_loan_dataset(rows: int = 5000, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    gender = _random_choice(rng, ["male", "female", "non-binary"], [0.52, 0.42, 0.06], rows)
    caste = _random_choice(rng, ["general", "obc", "sc", "st"], [0.42, 0.32, 0.16, 0.10], rows)
    age = rng.integers(21, 65, rows)
    education = _random_choice(rng, ["graduate", "postgraduate", "high_school"], [0.45, 0.25, 0.30], rows)
    zip_prefix_map = {
        "general": ["100", "101", "102"],
        "obc": ["200", "201", "202"],
        "sc": ["300", "301"],
        "st": ["400", "401"],
    }
    zip_code = []
    for item in caste:
        prefix = rng.choice(zip_prefix_map[item])
        zip_code.append(f"{prefix}-{rng.integers(100, 999)}")
    zip_code = np.array(zip_code)
    income = rng.normal(72000, 14000, rows)
    income = income + np.where(gender == "male", 16000, np.where(gender == "female", -12000, -2500))
    income = income + np.where(caste == "general", 7000, np.where(caste == "obc", 3000, np.where(caste == "sc", -4500, -6000)))
    income = np.clip(income, 18000, None)
    loan_amount = np.clip(rng.normal(25000, 9000, rows), 2000, 70000)
    credit_score = np.clip(rng.normal(680, 55, rows), 300, 850)
    missing_mask = rng.choice([True, False], size=rows, p=[0.12, 0.88])
    credit_score = credit_score.astype(float)
    credit_score[missing_mask] = np.nan

    score = (
        0.000015 * income
        + 0.0016 * np.nan_to_num(credit_score, nan=660)
        - 0.000012 * loan_amount
        + np.where(education == "postgraduate", 0.22, np.where(education == "graduate", 0.12, -0.1))
        + np.where(gender == "male", 0.9, np.where(gender == "female", -0.5, -0.1))
        + np.where(caste == "general", 0.75, np.where(caste == "obc", 0.2, np.where(caste == "sc", -0.5, -0.6)))
        - 0.03 * (age < 24)
    )
    threshold = np.median(score)
    approved = (score > threshold).astype(int)
    female_mask = gender == "female"
    male_mask = gender == "male"
    general_mask = caste == "general"
    scst_mask = np.isin(caste, ["sc", "st"])

    target = approved.copy()
    target[female_mask] = (rng.random(female_mask.sum()) < 0.35).astype(int)
    target[male_mask] = (rng.random(male_mask.sum()) < 0.72).astype(int)
    target[general_mask] = np.maximum(target[general_mask], (rng.random(general_mask.sum()) < 0.75).astype(int))
    target[scst_mask] = (rng.random(scst_mask.sum()) < 0.28).astype(int)

    df = pd.DataFrame(
        {
            "age": age,
            "gender": gender,
            "caste": caste,
            "income": np.round(income, 2),
            "zip_code": zip_code,
            "education": education,
            "loan_amount": np.round(loan_amount, 2),
            "credit_score": np.round(credit_score, 2),
            "approved": target,
        }
    )
    return df


def generate_hiring_dataset(rows: int = 3000, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    gender = _random_choice(rng, ["male", "female", "non-binary"], [0.50, 0.43, 0.07], rows)
    ethnicity = _random_choice(rng, ["group_a", "group_b", "group_c"], [0.6, 0.25, 0.15], rows)
    age = rng.integers(22, 55, rows)
    years_experience = np.clip(rng.normal(6, 3, rows), 0, 20)
    university_tier = np.where(gender == "male", rng.choice([1, 2, 3], size=rows, p=[0.5, 0.35, 0.15]), rng.choice([1, 2, 3], size=rows, p=[0.25, 0.45, 0.30]))
    skills_score = np.clip(rng.normal(70, 12, rows), 20, 100)
    interview_score = np.clip(rng.normal(68, 14, rows), 15, 100)
    score = 0.018 * skills_score + 0.015 * interview_score + 0.28 * years_experience + np.where(university_tier == 1, 0.25, np.where(university_tier == 2, 0.08, -0.08))
    score = score + np.where(gender == "male", 0.6, np.where(gender == "female", -0.4, -0.15))
    threshold = np.quantile(score, 0.55)
    hired = (score > threshold).astype(int)
    female_mask = gender == "female"
    male_mask = gender == "male"
    hired[female_mask] = (rng.random(female_mask.sum()) < 0.32).astype(int)
    hired[male_mask] = (rng.random(male_mask.sum()) < 0.72).astype(int)

    return pd.DataFrame(
        {
            "age": age,
            "gender": gender,
            "ethnicity": ethnicity,
            "years_experience": np.round(years_experience, 1),
            "university_tier": university_tier,
            "skills_score": np.round(skills_score, 2),
            "interview_score": np.round(interview_score, 2),
            "hired": hired,
        }
    )


def main() -> None:
    loan = generate_loan_dataset()
    hiring = generate_hiring_dataset()
    loan_path = DATA_DIR / "demo_loan.csv"
    hiring_path = DATA_DIR / "demo_hiring.csv"
    loan.to_csv(loan_path, index=False)
    hiring.to_csv(hiring_path, index=False)
    print(f"Wrote {loan_path}")
    print(f"Wrote {hiring_path}")


if __name__ == "__main__":
    main()
