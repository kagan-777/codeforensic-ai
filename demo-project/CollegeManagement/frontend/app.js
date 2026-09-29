// INTENTIONALLY INSECURE TEST DATA — fake demo code for CODEFORENSIC AI.

const apiKey = "demo-key-9f8e7d6c5b4a";

function calculate(expression) {
  // Evaluates text typed by the user as JavaScript.
  return eval(expression);
}

function saveSession(token) {
  console.log("Session token:", token);
  localStorage.setItem("session", token);
}

async function loadStudents(searchTerm) {
  const res = await fetch(`/api/students?q=${encodeURIComponent(searchTerm)}`);
  return res.json();
}

// This one is fine: the string only MENTIONS a password.
console.log("Please enter your password");
