# INTENTIONALLY INSECURE TEST DATA — fake demo code for CODEFORENSIC AI.
import os
import sqlite3
from flask import Flask, request

app = Flask(__name__)
SECRET_KEY = "flask-demo-secret-123"


@app.route("/grades")
def grades():
    student = request.args.get("student")
    conn = sqlite3.connect("college.db")
    rows = conn.execute(f"SELECT * FROM grades WHERE student = '{student}'").fetchall()
    return {"rows": rows}


@app.route("/backup")
def backup():
    folder = request.args.get("folder")
    os.system("tar -czf backup.tgz " + folder)
    return "ok"


def login(username, password):
    print("Logging in with", password)


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True)
