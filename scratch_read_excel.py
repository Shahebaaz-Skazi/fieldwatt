import pandas as pd
import json

try:
    df = pd.read_excel(r'f:\fieldwatt\reading correction 24.09.2026.xlsx')
    print("Total rows:", len(df))
    print("Headers:", list(df.columns))
    print("First 5 rows:")
    print(df.head(5).to_json(orient='records'))
except Exception as e:
    print("Error:", e)
