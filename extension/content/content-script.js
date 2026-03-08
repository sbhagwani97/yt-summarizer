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

// Check if we're on a YouTube watch page
function isWatchPage() {
  return window.location.pathname === "/watch" && window.location.search.includes("v=");
}

// Get video ID from URL
function getVideoId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("v");
}

// Panel state
let panelElement = null;
let isMinimized = false;
let isSignUpMode = false;

// Inject or update floating panel
async function injectPanel() {
  if (!isWatchPage()) {
    removePanel();
    return;
  }

  if (panelElement) {
    return; // Panel already exists
  }

  const container = document.createElement("div");
  container.id = "yt-summarizer-panel";

  // Get auth status
  const authStatus = await sendMessage({ type: "GET_AUTH_STATUS" });

  // Initial HTML (login view)
  container.innerHTML = `
    <div class="panel-header">
      <div class="panel-logo">▶</div>
      <h3>YT Summarizer</h3>
      <button class="panel-close-btn">✕</button>
    </div>
    <div class="panel-content">
      ${renderContent(authStatus)}
    </div>
  `;

  document.body.appendChild(container);
  panelElement = container;

  // Attach event listeners
  attachPanelListeners();
}

// Render panel content based on auth status
function renderContent(authStatus) {
  if (!authStatus.authenticated) {
    return `
      <div class="auth-tabs">
        <button class="tab-btn ${!isSignUpMode ? 'active' : ''}" data-mode="login">Login</button>
        <button class="tab-btn ${isSignUpMode ? 'active' : ''}" data-mode="signup">Sign Up</button>
      </div>
      <div class="login-view" style="display: ${!isSignUpMode ? 'block' : 'none'}">
        <form id="login-form">
          <input type="email" id="email-input" placeholder="Email" required />
          <input type="password" id="password-input" placeholder="Password" required />
          <button type="submit" class="btn-primary">Login</button>
        </form>
        <p class="login-hint">Sign in with your account</p>
      </div>
      <div class="signup-view" style="display: ${isSignUpMode ? 'block' : 'none'}">
        <form id="signup-form">
          <input type="email" id="signup-email-input" placeholder="Email" required />
          <input type="password" id="signup-password-input" placeholder="Password" required />
          <input type="password" id="signup-password-confirm-input" placeholder="Confirm Password" required />
          <button type="submit" class="btn-primary">Create Account</button>
        </form>
        <p class="login-hint">Create a new account</p>
      </div>
    `;
  }

  return `
    <div class="auth-view">
      <div class="user-info">
        <p class="user-email">${authStatus.email}</p>
        <span class="tier-badge ${authStatus.tier}">${authStatus.tier.toUpperCase()}</span>
      </div>
      <button class="btn-primary btn-summarize" id="btn-summarize">Summarize Video</button>
      <div id="summary-container" style="display: none;">
        <div id="summary-content"></div>
      </div>
      <div id="error-container" style="display: none;">
        <p id="error-text"></p>
      </div>
      <button class="btn-secondary" id="btn-logout">Logout</button>
    </div>
  `;
}

// Attach event listeners to panel
function attachPanelListeners() {
  const closeBtn = panelElement.querySelector(".panel-close-btn");
  closeBtn.addEventListener("click", minimizePanel);

  // Tab switching
  const tabBtns = panelElement.querySelectorAll(".tab-btn");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      const mode = e.target.dataset.mode;
      isSignUpMode = mode === "signup";

      // Update tab styles
      tabBtns.forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");

      // Toggle view visibility
      const loginView = panelElement.querySelector(".login-view");
      const signupView = panelElement.querySelector(".signup-view");
      if (loginView) loginView.style.display = isSignUpMode ? "none" : "block";
      if (signupView) signupView.style.display = isSignUpMode ? "block" : "none";

      // Re-attach form listeners
      const loginForm = panelElement.querySelector("#login-form");
      if (loginForm) {
        loginForm.removeEventListener("submit", handleLogin);
        loginForm.addEventListener("submit", handleLogin);
      }
      const signupForm = panelElement.querySelector("#signup-form");
      if (signupForm) {
        signupForm.removeEventListener("submit", handleSignUp);
        signupForm.addEventListener("submit", handleSignUp);
      }
    });
  });

  const loginForm = panelElement.querySelector("#login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }

  const signupForm = panelElement.querySelector("#signup-form");
  if (signupForm) {
    signupForm.addEventListener("submit", handleSignUp);
  }

  const summarizeBtn = panelElement.querySelector("#btn-summarize");
  if (summarizeBtn) {
    summarizeBtn.addEventListener("click", handleSummarize);
  }

  const logoutBtn = panelElement.querySelector("#btn-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogout);
  }
}

// Handle login
async function handleLogin(e) {
  e.preventDefault();

  const emailInput = panelElement.querySelector("#email-input");
  const passwordInput = panelElement.querySelector("#password-input");

  const email = emailInput.value;
  const password = passwordInput.value;

  // Show loading state
  const submitBtn = panelElement.querySelector("#login-form .btn-primary");
  submitBtn.disabled = true;
  submitBtn.textContent = "Logging in...";

  try {
    const result = await sendMessage({
      type: "LOGIN",
      email,
      password
    });

    if (result.success) {
      // Refresh panel with authenticated view
      const content = panelElement.querySelector(".panel-content");
      content.innerHTML = renderContent({
        authenticated: true,
        tier: result.tier,
        email: result.email
      });
      attachPanelListeners();
      isMinimized = false;
    } else {
      alert("Login failed: " + (result.error || "Unknown error"));
      submitBtn.disabled = false;
      submitBtn.textContent = "Login";
    }
  } catch (e) {
    alert("Login error: " + e.message);
    submitBtn.disabled = false;
    submitBtn.textContent = "Login";
  }
}

// Handle sign up
async function handleSignUp(e) {
  e.preventDefault();

  const emailInput = panelElement.querySelector("#signup-email-input");
  const passwordInput = panelElement.querySelector("#signup-password-input");
  const confirmInput = panelElement.querySelector("#signup-password-confirm-input");

  const email = emailInput.value;
  const password = passwordInput.value;
  const confirm = confirmInput.value;

  if (password !== confirm) {
    alert("Passwords do not match");
    return;
  }

  if (password.length < 6) {
    alert("Password must be at least 6 characters");
    return;
  }

  // Show loading state
  const submitBtn = panelElement.querySelector("#signup-form .btn-primary");
  submitBtn.disabled = true;
  submitBtn.textContent = "Creating account...";

  try {
    const result = await sendMessage({
      type: "REGISTER",
      email,
      password
    });

    if (result.success) {
      // Auto-login after successful registration
      const content = panelElement.querySelector(".panel-content");
      content.innerHTML = renderContent({
        authenticated: true,
        tier: result.tier,
        email: result.email
      });
      attachPanelListeners();
      isMinimized = false;
      isSignUpMode = false;
    } else {
      alert("Sign up failed: " + (result.error || "Unknown error"));
      submitBtn.disabled = false;
      submitBtn.textContent = "Create Account";
    }
  } catch (e) {
    alert("Sign up error: " + e.message);
    submitBtn.disabled = false;
    submitBtn.textContent = "Create Account";
  }
}

// Render a single section based on its style
function renderSection(section) {
  const styleMap = {
    text: `<p class="section-text">${section.content || ""}</p>`,
    bullets: `<ul class="section-bullets">${(section.items || []).map(i => `<li>${i}</li>`).join("")}</ul>`,
    checklist: `<ul class="section-checklist">${(section.items || []).map(i => `<li><span class="check">✓</span>${i}</li>`).join("")}</ul>`,
    steps: `<ol class="section-steps">${(section.items || []).map(i => `<li>${i}</li>`).join("")}</ol>`,
  };
  const body = styleMap[section.style] || styleMap.bullets;
  return `
    <div class="summary-section">
      <h4 class="section-label">${section.label}</h4>
      ${body}
    </div>`;
}

const TYPE_BADGE = {
  recipe:        { icon: "🍳", label: "Recipe" },
  tutorial:      { icon: "🛠️", label: "Tutorial" },
  review:        { icon: "⭐", label: "Review" },
  educational:   { icon: "🎓", label: "Educational" },
  news:          { icon: "📰", label: "News" },
  entertainment: { icon: "🎬", label: "Entertainment" },
  other:         { icon: "📄", label: "Video" },
};

function renderSummary(result) {
  const badge = TYPE_BADGE[result.type] || TYPE_BADGE.other;
  const sections = (result.sections || []).map(renderSection).join("");
  const highlights = (result.highlights || []).map(h => `<li>${h}</li>`).join("");

  return `
    <div class="summary-type-badge">
      <span class="type-icon">${badge.icon}</span>
      <span class="type-label">${badge.label}</span>
    </div>
    <div class="summary-overview">
      <p>${result.overview || ""}</p>
    </div>
    ${sections}
    ${highlights ? `
    <div class="summary-section">
      <h4 class="section-label">Key Takeaways</h4>
      <ul class="section-bullets">${highlights}</ul>
    </div>` : ""}
  `;
}

// Handle summarize
async function handleSummarize() {
  const videoId = getVideoId();
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  const summarizeBtn = panelElement.querySelector("#btn-summarize");
  const summaryContainer = panelElement.querySelector("#summary-container");
  const errorContainer = panelElement.querySelector("#error-container");

  // Clear previous state
  summaryContainer.style.display = "none";
  errorContainer.style.display = "none";

  // Show loading
  summarizeBtn.disabled = true;
  summarizeBtn.innerHTML = '<span class="loading-spinner"></span>Summarizing...';

  try {
    const result = await sendMessage({
      type: "SUMMARIZE",
      videoUrl
    });

    if (result.success) {
      const summaryContent = panelElement.querySelector("#summary-content");
      summaryContent.innerHTML = renderSummary(result);
      summaryContainer.style.display = "block";
    } else {
      const errorText = panelElement.querySelector("#error-text");
      errorText.textContent = result.error || "Failed to summarize video";

      if (result.sessionExpired) {
        // Refresh panel to show login again
        const content = panelElement.querySelector(".panel-content");
        content.innerHTML = renderContent({
          authenticated: false,
          tier: null,
          email: null
        });
        attachPanelListeners();
      } else {
        errorContainer.style.display = "block";
      }
    }
  } catch (e) {
    const errorText = panelElement.querySelector("#error-text");
    errorText.textContent = "Error: " + e.message;
    errorContainer.style.display = "block";
  } finally {
    summarizeBtn.disabled = false;
    summarizeBtn.innerHTML = "Summarize Video";
  }
}

// Handle logout
async function handleLogout() {
  try {
    await sendMessage({ type: "LOGOUT" });

    // Refresh panel with login view
    const content = panelElement.querySelector(".panel-content");
    content.innerHTML = renderContent({
      authenticated: false,
      tier: null,
      email: null
    });
    attachPanelListeners();
    isMinimized = false;
  } catch (e) {
    alert("Logout error: " + e.message);
  }
}

// Minimize panel
function minimizePanel() {
  if (!panelElement) return;

  isMinimized = true;
  panelElement.classList.add("minimized");

  const header = panelElement.querySelector(".panel-header");
  const openBtn = document.createElement("button");
  openBtn.className = "panel-expand-btn";
  openBtn.textContent = "Open";
  openBtn.addEventListener("click", expandPanel);

  header.appendChild(openBtn);
}

// Expand panel
function expandPanel() {
  if (!panelElement) return;

  isMinimized = false;
  panelElement.classList.remove("minimized");

  const openBtn = panelElement.querySelector(".panel-expand-btn");
  if (openBtn) {
    openBtn.remove();
  }
}

// Remove panel
function removePanel() {
  if (panelElement) {
    panelElement.remove();
    panelElement = null;
    isMinimized = false;
  }
}

// Navigation detection: YouTube's yt-navigate-finish event
document.addEventListener("yt-navigate-finish", () => {
  console.log("YouTube navigation detected");
  if (isWatchPage()) {
    injectPanel();
  } else {
    removePanel();
  }
});

// Fallback: Monkey-patch history.pushState
const originalPushState = history.pushState;
history.pushState = function () {
  originalPushState.apply(this, arguments);
  setTimeout(() => {
    if (isWatchPage()) {
      injectPanel();
    } else {
      removePanel();
    }
  }, 100);
};

// Fallback: Listen to popstate (back/forward)
window.addEventListener("popstate", () => {
  setTimeout(() => {
    if (isWatchPage()) {
      injectPanel();
    } else {
      removePanel();
    }
  }, 100);
});

// Initial check on page load
if (isWatchPage()) {
  injectPanel();
}
