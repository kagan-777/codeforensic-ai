# ⚠️ INTENTIONALLY INSECURE TEST DATA — "improved" version for rescan testing ⚠️

Some patterns were fixed. The os.system and Runtime.exec calls are intentionally still here.

This "CollegeManagement" project is a **fake demo project** used to test
CODEFORENSIC AI. It deliberately contains insecure-looking code patterns:

1. Hardcoded secrets (fake values — none of them are real credentials)
2. SQL query string concatenation
3. Dangerous function usage (eval, os.system, Runtime.exec)
4. Logging of sensitive information
5. Insecure configuration (debug mode, exposed endpoints)

Do NOT copy this code into a real project. Do NOT deploy it.
It is never executed by CODEFORENSIC AI — the scanner only reads it as text.
