// Send message to service worker and return promise
function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// Render main content
async function renderPopup() {
  const main = document.getElementById("popup-main");

  try {
    const authStatus = await sendMessage({ type: "GET_AUTH_STATUS" });

    if (!authStatus.authenticated) {
      renderLoginView(main);
    } else {
      renderAuthView(main, authStatus);
    }
  } catch (e) {
    main.innerHTML = `<p class="error">Error: ${e.message}</p>`;
  }
}

// Render login view
function renderLoginView(container) {
  container.innerHTML = `
    <form id="popup-login-form" class="form">
      <div class="form-group">
        <input type="email" id="popup-email" placeholder="Email" required />
      </div>
      <div class="form-group">
        <input type="password" id="popup-password" placeholder="Password" required />
      </div>
      <button type="submit" class="btn-primary">Login</button>
    </form>
  `;

  const form = container.querySelector("#popup-login-form");
  form.addEventListener("submit", handlePopupLogin);
}

// Render authenticated view
function renderAuthView(container, authStatus) {
  let tierHtml = "";
  if (authStatus.tier === "free") {
    tierHtml = `
      <div class="tier-info">
        <p class="tier-label">FREE TIER</p>
        <p class="tier-desc">Limited summaries per month</p>
        <a href="#" class="upgrade-link">Upgrade to Pro →</a>
      </div>
    `;
  } else if (authStatus.tier === "pro") {
    tierHtml = `
      <div class="tier-info pro">
        <p class="tier-label">✓ PRO TIER</p>
        <p class="tier-desc">Unlimited summaries</p>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="auth-info">
      <p class="user-email">${authStatus.email}</p>
      ${tierHtml}
    </div>
    <button id="popup-logout-btn" class="btn-secondary">Logout</button>
  `;

  const logoutBtn = container.querySelector("#popup-logout-btn");
  logoutBtn.addEventListener("click", handlePopupLogout);
}

// Handle popup login
async function handlePopupLogin(e) {
  e.preventDefault();

  const emailInput = document.getElementById("popup-email");
  const passwordInput = document.getElementById("popup-password");
  const submitBtn = e.target.querySelector("button[type='submit']");

  const email = emailInput.value;
  const password = passwordInput.value;

  submitBtn.disabled = true;
  submitBtn.textContent = "Logging in...";

  try {
    const result = await sendMessage({
      type: "LOGIN",
      email,
      password
    });

    if (result.success) {
      await renderPopup();
    } else {
      alert("Login failed: " + (result.error || "Unknown error"));
      submitBtn.disabled = false;
      submitBtn.textContent = "Login";
    }
  } catch (e) {
    alert("Error: " + e.message);
    submitBtn.disabled = false;
    submitBtn.textContent = "Login";
  }
}

// Handle popup logout
async function handlePopupLogout() {
  try {
    await sendMessage({ type: "LOGOUT" });
    await renderPopup();
  } catch (e) {
    alert("Error: " + e.message);
  }
}

// Initialize popup
document.addEventListener("DOMContentLoaded", renderPopup);
