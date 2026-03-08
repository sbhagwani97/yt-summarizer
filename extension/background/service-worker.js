const API_BASE = "http://localhost:8000/api/v1";

// Decode JWT payload (base64 decode without padding)
function decodeJwt(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    let payload = parts[1];
    // Add padding if needed
    payload += "===".substring(0, (4 - payload.length % 4) % 4);

    const decoded = JSON.parse(atob(payload));
    return decoded;
  } catch (e) {
    console.error("JWT decode error:", e);
    return null;
  }
}

// Check if JWT is expired
function isTokenExpired(token) {
  const payload = decodeJwt(token);
  if (!payload || !payload.exp) return true;

  const now = Date.now() / 1000;
  return payload.exp < now;
}

// Get auth status
async function getAuthStatus() {
  try {
    const result = await chrome.storage.local.get("jwt");
    const token = result.jwt;

    if (!token || isTokenExpired(token)) {
      // Clear expired token
      if (token) {
        await chrome.storage.local.remove("jwt");
      }
      return {
        authenticated: false,
        tier: null,
        email: null
      };
    }

    const payload = decodeJwt(token);
    return {
      authenticated: true,
      tier: payload.tier || "free",
      email: payload.email || "unknown"
    };
  } catch (e) {
    console.error("Error checking auth status:", e);
    return {
      authenticated: false,
      tier: null,
      email: null
    };
  }
}

// Handle registration
async function handleRegister(email, password) {
  try {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || errorData.message || `Registration failed with status ${response.status}`);
    }

    const data = await response.json();
    const token = data.token;

    // Store JWT
    await chrome.storage.local.set({ jwt: token });

    const authStatus = await getAuthStatus();
    return {
      success: true,
      ...authStatus
    };
  } catch (e) {
    console.error("Registration error:", e);
    return {
      success: false,
      error: e.message
    };
  }
}

// Handle login
async function handleLogin(email, password) {
  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || errorData.message || `Login failed with status ${response.status}`);
    }

    const data = await response.json();
    const token = data.token;

    // Store JWT
    await chrome.storage.local.set({ jwt: token });

    const authStatus = await getAuthStatus();
    return {
      success: true,
      ...authStatus
    };
  } catch (e) {
    console.error("Login error:", e);
    return {
      success: false,
      error: e.message
    };
  }
}

// Handle logout
async function handleLogout() {
  try {
    await chrome.storage.local.remove("jwt");
    return { success: true };
  } catch (e) {
    console.error("Logout error:", e);
    return { success: false, error: e.message };
  }
}

// Handle summarize request
async function handleSummarize(videoUrl) {
  try {
    const result = await chrome.storage.local.get("jwt");
    const token = result.jwt;

    if (!token) {
      return {
        success: false,
        error: "Not authenticated"
      };
    }

    const response = await fetch(`${API_BASE}/summarize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ videoUrl })
    });

    if (response.status === 401) {
      // Token expired or invalid
      await chrome.storage.local.remove("jwt");
      return {
        success: false,
        error: "Session expired. Please log in again.",
        sessionExpired: true
      };
    }

    if (response.status === 402) {
      return {
        success: false,
        error: "Monthly quota exceeded. Upgrade to Pro.",
        quotaExceeded: true
      };
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `API error ${response.status}`);
    }

    const data = await response.json();
    return {
      success: true,
      type: data.type,
      overview: data.overview,
      sections: data.sections,
      highlights: data.highlights
    };
  } catch (e) {
    console.error("Summarize error:", e);
    return {
      success: false,
      error: e.message
    };
  }
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    console.log("Service Worker received message:", request.type);

    try {
      let response;

      switch (request.type) {
        case "GET_AUTH_STATUS":
          response = await getAuthStatus();
          break;

        case "REGISTER":
          response = await handleRegister(request.email, request.password);
          break;

        case "LOGIN":
          response = await handleLogin(request.email, request.password);
          break;

        case "LOGOUT":
          response = await handleLogout();
          break;

        case "SUMMARIZE":
          response = await handleSummarize(request.videoUrl);
          break;

        default:
          response = { error: "Unknown message type" };
      }

      sendResponse(response);
    } catch (e) {
      console.error("Message handler error:", e);
      sendResponse({ error: e.message });
    }
  })();

  // Return true to indicate we'll send response asynchronously
  return true;
});
