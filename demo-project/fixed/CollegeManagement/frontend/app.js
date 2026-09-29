// INTENTIONALLY INSECURE TEST DATA — fake demo code for CODEFORENSIC AI.

const apiKey = window.APP_CONFIG.publicApiKey;

function calculate(expression) {
  // Evaluates text typed by the user as JavaScript.
  return Number.parseFloat(expression);
}

function saveSession(token) {
  localStorage.setItem("session", token);
}

async function loadStudents(searchTerm) {
  const res = await fetch(`/api/students?q=${encodeURIComponent(searchTerm)}`);
  return res.json();
}

// This one is fine: the string only MENTIONS a password.
console.log("Please enter your password");
