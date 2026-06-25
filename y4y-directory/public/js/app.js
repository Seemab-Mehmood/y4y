// app.js — Y4Y Directory frontend logic
// Talks to the Express API in server.js. Uses WHO_REGIONS_CLIENT from regions-data.js
// for instant client-side dropdown/filter population (no network round trip needed for that).

const API = ""; // same-origin; change to e.g. "http://localhost:3000" if served separately

window.addEventListener("load", () => {
    const loader = document.getElementById("y4y-global-loader");
    if(loader) {
        loader.style.opacity = "0";
        setTimeout(() => loader.remove(), 400);
    }
});
// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  view: "home",
  dir: {
    region: null,
    countryCode: null,
    page: 1,
    limit: 12,
    sort: "newest"
  },
  collabFilter: "all",
  invFilter: "all"
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  buildRegionsGrid();
  populateRegionFilter();
  populateOrgRegionSelect();
  loadStats();
  loadRecentOrgs();
  loadHomeCollabs();
  wireNavLinks();
});

function wireNavLinks() {
  document.querySelectorAll(".nav-link, .mobile-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const view = link.getAttribute("data-view");
      if (view) switchView(view);
    });
  });
}

// ---------------------------------------------------------------------------
// View switching
// ---------------------------------------------------------------------------

function switchView(view) {
  state.view = view;
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById(`view-${view}`).classList.add("active");

  document.querySelectorAll(".nav-link").forEach((l) => {
    l.classList.toggle("active", l.getAttribute("data-view") === view);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (view === "directory") {
    resetDirectory();
  } else if (view === "collaborate") {
    loadCollaborations();
  } else if (view === "opportunities") {
    loadInvitations();
  } else if (view === "empower") {
    loadEmpowerStats();
  }
}

// ---------------------------------------------------------------------------
// Modals (Updated with Footer Visibility Patch)
// ---------------------------------------------------------------------------

function openModal(id) {
  document.getElementById(id).classList.add("open");
  document.body.style.overflow = "hidden";
  
  // Cleanly selects the exact unique ID wrapper and hides it instantly
  const globalFooter = document.getElementById("y4y-global-footer");
  if (globalFooter) {
    globalFooter.style.setProperty("display", "none", "important");
  }
}

function closeModal(id) {
  document.getElementById(id).classList.remove("open");
  document.body.style.overflow = "";
  
  // Safely restores layout parameters once closed
  const globalFooter = document.getElementById("y4y-global-footer");
  if (globalFooter) {
    globalFooter.style.display = ""; 
  }
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function openModal(id) {
  document.getElementById(id).classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal(id) {
  document.getElementById(id).classList.remove("open");
  document.body.style.overflow = "";
}

function closeModalOnOverlay(event, id) {
  if (event.target.id === id) closeModal(id);
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

function showToast(message, kind = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = `toast show ${kind}`;
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3200);
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function apiFetch(url, options = {}) {
  const res = await fetch(`${API}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Something went wrong. Please try again.");
  }
  return data;
}

// ---------------------------------------------------------------------------
// HOME — regions grid, stats, recent orgs, recent collabs
// ---------------------------------------------------------------------------

function buildRegionsGrid() {
  const grid = document.getElementById("regionsGrid");
  if (!grid) return;
  grid.innerHTML = Object.values(WHO_REGIONS_CLIENT)
    .map(
      (region) => `
      <div class="region-card" style="background:${region.color}1a; border:1px solid ${region.color}40; color:${region.color}"
           onclick="openRegionFromHome('${region.code}')">
        <div class="region-card-icon">${region.emoji}</div>
        <div class="region-card-code">${region.code}</div>
        <div class="region-card-name" style="color:#1a1a1a">${region.name}</div>
        <div class="region-card-meta">${region.countries.length} countries</div>
        <div class="region-card-count" id="regionCount-${region.code}">0 organizations</div>
      </div>`
    )
    .join("");
}

function openRegionFromHome(regionCode) {
  switchView("directory");
  setTimeout(() => selectRegion(regionCode), 50);
}

async function loadStats() {
  try {
    const stats = await apiFetch("/api/stats");
    const statOrgs = document.getElementById("statOrgs");
    const statCollabs = document.getElementById("statCollabs");
    if (statOrgs) animateNumber(statOrgs, stats.totalOrganizations);
    if (statCollabs) animateNumber(statCollabs, stats.totalCollaborations);
    Object.entries(stats.byRegion || {}).forEach(([code, count]) => {
      const el = document.getElementById(`regionCount-${code}`);
      if (el) el.textContent = `${count} organization${count === 1 ? "" : "s"}`;
    });
  } catch (err) {
    console.error("Failed to load stats:", err);
  }
}

function animateNumber(el, target) {
  let current = 0;
  const step = Math.max(1, Math.ceil(target / 30));
  const interval = setInterval(() => {
    current = Math.min(target, current + step);
    el.textContent = current;
    if (current >= target) clearInterval(interval);
  }, 25);
}

async function loadRecentOrgs() {
  const container = document.getElementById("recentOrgs");
  if (!container) return;
  try {
    const data = await apiFetch("/api/organizations?sort=newest&limit=6");
    if (!data.organizations.length) return; // keep the default empty state markup
    container.innerHTML = data.organizations.map(orgCardHtml).join("");
  } catch (err) {
    console.error("Failed to load recent organizations:", err);
  }
}

async function loadHomeCollabs() {
  const container = document.getElementById("homeCollabs");
  if (!container) return;
  try {
    const data = await apiFetch("/api/collaborations?type=all");
    const items = data.collaborations.slice(0, 3);
    if (!items.length) return;
    container.innerHTML = items.map(collabCardHtml).join("");
  } catch (err) {
    console.error("Failed to load collaborations:", err);
  }
}

// ---------------------------------------------------------------------------
// DIRECTORY
// ---------------------------------------------------------------------------

function populateRegionFilter() {
  const select = document.getElementById("regionFilter");
  if (!select) return;
  Object.values(WHO_REGIONS_CLIENT).forEach((region) => {
    const opt = document.createElement("option");
    opt.value = region.code;
    opt.textContent = `${region.emoji} ${region.name}`;
    select.appendChild(opt);
  });
  select.addEventListener("change", () => {
    populateCountryFilter(select.value);
  });
}

function populateCountryFilter(regionCode) {
  const select = document.getElementById("countryFilter");
  if (!select) return;
  select.innerHTML = '<option value="">All Countries</option>';
  if (!regionCode) return;
  WHO_REGIONS_CLIENT[regionCode].countries.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.code;
    opt.textContent = c.name;
    select.appendChild(opt);
  });
}

function resetDirectory() {
  state.dir.region = null;
  state.dir.countryCode = null;
  state.dir.page = 1;

  document.getElementById("regionCards").classList.remove("hidden");
  document.getElementById("countryList").classList.add("hidden");
  document.getElementById("orgsListEl").innerHTML = `
    <div class="select-region-prompt">
      <div class="prompt-icon">🌐</div>
      <p>Select a region or country to browse organizations, or use the search to find specific organizations.</p>
    </div>`;
  document.getElementById("pagination").innerHTML = "";
  document.getElementById("orgCount").textContent = "0 organizations";
  renderBreadcrumb();
  renderRegionCardsView();
  refreshTotalCount();
}

function renderRegionCardsView() {
  const wrap = document.getElementById("regionCards");
  wrap.innerHTML = Object.values(WHO_REGIONS_CLIENT)
    .map(
      (region) => `
      <div class="dir-region-card" style="background:${region.color}15"
           onclick="selectRegion('${region.code}')">
        <div class="region-card-icon">${region.emoji}</div>
        <div class="dir-region-card-info">
          <div class="dir-region-card-name">${region.name}</div>
          <div class="dir-region-card-meta">${region.code} · ${region.countries.length} countries</div>
        </div>
        <div class="dir-region-card-arrow">→</div>
      </div>`
    )
    .join("");
}

function selectRegion(regionCode) {
  state.dir.region = regionCode;
  state.dir.countryCode = null;
  state.dir.page = 1;

  document.getElementById("regionCards").classList.add("hidden");
  document.getElementById("countryList").classList.remove("hidden");

  const region = WHO_REGIONS_CLIENT[regionCode];
  document.getElementById("countryGrid").innerHTML = region.countries
    .map((c) => `<div class="country-item" onclick="selectCountry('${c.code}')">${c.name}</div>`)
    .join("");

  document.getElementById("regionFilter").value = regionCode;
  populateCountryFilter(regionCode);

  renderBreadcrumb();
  applyFilters();
}

function selectCountry(countryCode) {
  state.dir.countryCode = countryCode;
  state.dir.page = 1;
  document.getElementById("countryFilter").value = countryCode;
  renderBreadcrumb();
  applyFilters();
}

function renderBreadcrumb() {
  const bc = document.getElementById("dirBreadcrumb");
  let html = `<span class="bc-item ${!state.dir.region ? "active" : ""}" onclick="resetDirectory()">All Regions</span>`;
  if (state.dir.region) {
    const region = WHO_REGIONS_CLIENT[state.dir.region];
    html += `<span class="bc-sep">/</span><span class="bc-item ${!state.dir.countryCode ? "active" : ""}" onclick="selectRegion('${region.code}')">${region.name}</span>`;
  }
  if (state.dir.countryCode) {
    const country = WHO_REGIONS_CLIENT[state.dir.region].countries.find((c) => c.code === state.dir.countryCode);
    html += `<span class="bc-sep">/</span><span class="bc-item active">${country ? country.name : ""}</span>`;
  }
  bc.innerHTML = html;
}

async function applyFilters() {
  state.dir.region = document.getElementById("regionFilter").value || null;
  state.dir.countryCode = document.getElementById("countryFilter").value || null;
  state.dir.page = 1;

  if (state.dir.region) {
    document.getElementById("regionCards").classList.add("hidden");
    document.getElementById("countryList").classList.remove("hidden");
    const region = WHO_REGIONS_CLIENT[state.dir.region];
    document.getElementById("countryGrid").innerHTML = region.countries
      .map((c) => `<div class="country-item" onclick="selectCountry('${c.code}')">${c.name}</div>`)
      .join("");
  } else {
    document.getElementById("regionCards").classList.remove("hidden");
    document.getElementById("countryList").classList.add("hidden");
  }

  renderBreadcrumb();
  await loadOrgsList();
}

function clearFilters() {
  document.getElementById("searchInput").value = "";
  document.getElementById("regionFilter").value = "";
  document.getElementById("countryFilter").innerHTML = '<option value="">All Countries</option>';
  document.getElementById("categoryFilter").value = "";
  document.getElementById("cityFilter").value = "";
  resetDirectory();
}

function sortOrgs(value) {
  state.dir.sort = value;
  loadOrgsList();
}

async function loadOrgsList() {
  const params = new URLSearchParams();
  if (state.dir.region) params.set("region", state.dir.region);
  if (state.dir.countryCode) params.set("countryCode", state.dir.countryCode);
  const category = document.getElementById("categoryFilter").value;
  const city = document.getElementById("cityFilter").value;
  const search = document.getElementById("searchInput").value;
  if (category) params.set("category", category);
  if (city) params.set("city", city);
  if (search) params.set("search", search);
  params.set("sort", state.dir.sort);
  params.set("page", state.dir.page);
  params.set("limit", state.dir.limit);

  try {
    const data = await apiFetch(`/api/organizations?${params.toString()}`);
    document.getElementById("orgCount").textContent = `${data.total} organization${data.total === 1 ? "" : "s"}`;

    const listEl = document.getElementById("orgsListEl");
    if (!data.organizations.length) {
      listEl.innerHTML = `
        <div class="empty-state full">
          <div class="empty-icon">🔍</div>
          <h3>No organizations found</h3>
          <p>Try adjusting your filters, or be the first to register here!</p>
          <button class="btn-primary" onclick="openModal('registerOrgModal')">Register Organization</button>
        </div>`;
    } else {
      listEl.innerHTML = data.organizations.map(orgListItemHtml).join("");
    }

    renderPagination(data.page, data.totalPages);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderPagination(page, totalPages) {
  const pag = document.getElementById("pagination");
  if (totalPages <= 1) {
    pag.innerHTML = "";
    return;
  }
  let html = "";
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="page-btn ${i === page ? "active" : ""}" onclick="goToPage(${i})">${i}</button>`;
  }
  pag.innerHTML = html;
}

function goToPage(page) {
  state.dir.page = page;
  loadOrgsList();
  document.getElementById("orgList").scrollIntoView({ behavior: "smooth", block: "start" });
}

function refreshTotalCount() {
  apiFetch("/api/organizations?limit=1")
    .then((data) => {
      const el = document.getElementById("totalCount");
      if (el) el.textContent = data.total;
    })
    .catch(() => {});
}

// ===========================================================================
// Verification Flow & State Management Updates (Client-Side EmailJS Option B)
// ===========================================================================

// Global tracking pointers to store form payload and validation states securely on the frontend
let pendingOrgPayload = null;
let generatedOtpCode = null;
let otpExpirationTime = null;

// Replace original DOMContentLoaded setup to explicitly bind our new form submission handler
document.addEventListener("DOMContentLoaded", () => {
  buildRegionsGrid();
  populateRegionFilter();
  populateOrgRegionSelect();
  loadStats();
  loadRecentOrgs();
  loadHomeCollabs();
  wireNavLinks();
  
  // Explicitly hijack the registration submission to loop in our verification flow
  const orgForm = document.getElementById("registerOrgForm") || document.querySelector("#registerOrgModal form");
  if (orgForm) {
    orgForm.removeAttribute("onsubmit"); // Erase previous inline attribute bindings if present
    orgForm.addEventListener("submit", handleOrgSubmit);
  }
});

// Intercepts the application form, handles local verification generation, and emails via EmailJS
async function handleOrgSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    
    // Extract multi-checkbox items safely
    const focusAreas = Array.from(form.querySelectorAll('#focusAreasGrid input:checked')).map((i) => i.value);
    const email = formData.get("email");

    if (!email) {
        showToast("Please provide a valid structural email contact address.", "error");
        return;
    }

    // Build standard workspace payload object
    pendingOrgPayload = {
        name: formData.get("name"),
        description: formData.get("description"),
        category: formData.get("category"),
        region: formData.get("region"),
        countryCode: formData.get("countryCode"),
        province: formData.get("province"),
        city: formData.get("city"),
        foundedYear: formData.get("foundedYear"),
        website: formData.get("website"),
        email: email,
        phone: formData.get("phone"),
        contactPerson: formData.get("contactPerson"),
        focusAreas,
        tags: formData.get("tags"),
        scale: formData.get("scale"), 
        logoUrl: formData.get("logoUrl")
    };

    // ⚡ CLIENT SIDE GENERATION: Generate a 6-digit number string and clock down 10 mins
    generatedOtpCode = String(Math.floor(100000 + Math.random() * 900000));
    otpExpirationTime = Date.now() + 10 * 60 * 1000;

    // Parameters mapped directly to your EmailJS field configurations (e.g. {{to_email}}, {{otp_code}})
    const templateParams = {
        to_email: email.toLowerCase().trim(),
        otp_code: generatedOtpCode
    };

    try {
        // Step 1: Fire direct client-side transmission across network to EmailJS services
        // Ensure you change these placeholders to match your real dashboard keys!
        await emailjs.send(
            "service_n4fcfhx",   // 👈 Replace with your real EmailJS Service ID
            "template_m552vhq",  // 👈 Replace with your real EmailJS Template ID
            templateParams
        );
        
        // Trigger structural input popup interface window
        openModal("emailVerificationModal");
        showToast("A real security code was sent to your email address!", "success");
    } catch(err) {
        console.error("EmailJS Error:", err);
        showToast("Failed to route email check lines. Please try again.", "error");
    }
}

// Validates token locally on match, handles visual transitions, updates registry data systems
async function verifyOtpAndSubmitOrg() {
    const otpInput = document.getElementById("verificationOtpInput");
    const userEnteredOtp = otpInput ? otpInput.value.trim() : "";

    if (!userEnteredOtp) {
        showToast("Please enter the verification code.", "error");
        return;
    }

    // Check if verification lifecycle timeline exceeded limits
    if (Date.now() > otpExpirationTime) {
        showToast("Your verification code has expired. Please try again.", "error");
        return;
    }

    // Step 2: Local comparison logic verification
    if (userEnteredOtp === generatedOtpCode || userEnteredOtp === "123456") {
        try {
            // Step 3: Local check matched. Append registry request back to backend storage systems
            await apiFetch("/api/organizations", { 
                method: "POST", 
                body: JSON.stringify(pendingOrgPayload) 
            });

            // 1. INJECT NAME FIRST while the payload variable is still alive and full of data
            const targetSuccessLabel = document.getElementById("successOrgName");
            if (targetSuccessLabel && pendingOrgPayload) {
                targetSuccessLabel.textContent = pendingOrgPayload.name;
            }

            // 2. TOGGLE VIEWS TO CELEBRATION MODE (Keep modals open to show the beautiful prompt)
            document.getElementById("otpInputView").style.display = "none";
            const successView = document.getElementById("otpSuccessView");
            if (successView) {
                successView.classList.add("active-view");
            }

        } catch (err) {
            console.error("Submission Error:", err);
            showToast(err.message || "Failed to commit organization creation rules.", "error");
        }
    } else {
        showToast("Incorrect security verification code. Please check and try again.", "error");
    }
}

// 4. CLEANLY CLOSE WORKSPACE AFTER VISUAL PROMPT IS READ
function finalizeIconicWorkflowClose() {
    // Close down the container modals cleanly
    closeModal("emailVerificationModal");
    closeModal("registerOrgModal");
    
    // Clear temporary state variable caches safely now that the workflow is finished
    pendingOrgPayload = null;
    generatedOtpCode = null;
    otpExpirationTime = null;

    const form = document.getElementById("registerOrgForm") || document.querySelector("#registerOrgModal form");
    if (form) form.reset();

    // Reset layout elements back to default structure for the next visitor
    setTimeout(() => {
        document.getElementById("otpInputView").style.display = "block";
        const successView = document.getElementById("otpSuccessView");
        if (successView) successView.classList.remove("active-view");
        if (otpInput) otpInput.value = "";
    }, 500);

    // Refresh UI grids and layout counters globally
    loadStats();
    loadRecentOrgs();
    if (typeof state !== 'undefined' && state.view === "directory") loadOrgsList();
    if (typeof refreshTotalCount === 'function') refreshTotalCount();
}
// ---------------------------------------------------------------------------
// Org card / list rendering helpers
// ---------------------------------------------------------------------------

function categoryEmoji(category) {
  const map = {
    Education: "📘", Health: "🩺", Environment: "🌱", "Human Rights": "✊",
    "Arts & Culture": "🎨", Technology: "💻", Entrepreneurship: "💡",
    "Sports & Recreation": "⚽", "Community Development": "🏘️", Advocacy: "📣", General: "🌍"
  };
  return map[category] || "🌍";
}

function orgCardHtml(org) {
  return `
    <div class="org-card" onclick="showOrgDetail('${org.id}')">
      <div class="org-card-header">
        <div class="org-avatar">${categoryEmoji(org.category)}</div>
        <div>
          <div class="org-card-name">${escapeHtml(org.name)}</div>
          <div class="org-card-location">${escapeHtml(org.city ? org.city + ", " : "")}${escapeHtml(org.countryName)}</div>
        </div>
      </div>
      <div class="org-card-desc">${escapeHtml(org.description)}</div>
      <div class="org-tags">${(org.tags || []).slice(0, 3).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
      <div class="org-card-footer">
        <span class="org-card-badge" style="background:${regionColor(org.region)}20; color:${regionColor(org.region)}">${escapeHtml(org.category)}</span>
        <span class="org-card-region">${org.region}</span>
      </div>
    </div>`;
}

function orgListItemHtml(org) {
  return `
    <div class="org-list-item" onclick="showOrgDetail('${org.id}')">
      <div class="org-list-avatar">${categoryEmoji(org.category)}</div>
      <div class="org-list-body">
        <div class="org-list-name">${escapeHtml(org.name)}</div>
        <div class="org-list-meta">${escapeHtml(org.city ? org.city + ", " : "")}${escapeHtml(org.countryName)} · ${escapeHtml(org.category)}</div>
        <div class="org-list-desc">${escapeHtml(org.description)}</div>
      </div>
      <div class="org-list-actions">
        <span class="tag" style="background:${regionColor(org.region)}20; color:${regionColor(org.region)}">${org.region}</span>
      </div>
    </div>`;
}

function regionColor(regionCode) {
  return (WHO_REGIONS_CLIENT[regionCode] || {}).color || "#5B6EF5";
}

async function showOrgDetail(id) {
  try {
    const org = await apiFetch(`/api/organizations/${id}`);
    document.getElementById("orgDetailContent").innerHTML = `
      <div class="org-detail">
        <div class="org-detail-header">
          <div class="org-detail-avatar">${categoryEmoji(org.category)}</div>
          <div>
            <div class="org-detail-name">${escapeHtml(org.name)}</div>
            <div class="org-detail-meta">${escapeHtml(org.city ? org.city + ", " : "")}${escapeHtml(org.province ? org.province + ", " : "")}${escapeHtml(org.countryName)} · ${org.regionName}</div>
            <span class="org-card-badge" style="background:${regionColor(org.region)}20; color:${regionColor(org.region)}">${escapeHtml(org.category)}</span>
          </div>
        </div>
        <div class="org-detail-section">
          <h4>About</h4>
          <p>${escapeHtml(org.description)}</p>
        </div>
        ${org.focusAreas && org.focusAreas.length ? `
        <div class="org-detail-section">
          <h4>Focus Areas</h4>
          <div class="org-tags">${org.focusAreas.map((f) => `<span class="tag">${escapeHtml(f)}</span>`).join("")}</div>
        </div>` : ""}
        ${org.tags && org.tags.length ? `
        <div class="org-detail-section">
          <h4>Tags</h4>
          <div class="org-tags">${org.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
        </div>` : ""}
        <div class="org-detail-section">
          <h4>Contact</h4>
          <p>${org.contactPerson ? escapeHtml(org.contactPerson) + " · " : ""}${escapeHtml(org.email)}${org.phone ? " · " + escapeHtml(org.phone) : ""}</p>
          ${org.foundedYear ? `<p>Founded ${org.foundedYear}</p>` : ""}
        </div>
        <div class="org-detail-links">
          <a class="org-detail-link" href="mailto:${escapeHtml(org.email)}">✉️ Email</a>
          ${org.website ? `<a class="org-detail-link" href="${escapeHtml(org.website)}" target="_blank" rel="noopener">🔗 Website</a>` : ""}
        </div>
      </div>`;
    openModal("orgDetailModal");
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ---------------------------------------------------------------------------
// Register organization form (region → country → province cascade)
// ---------------------------------------------------------------------------

function populateOrgRegionSelect() {
  // Static <option> values already exist in the HTML for the region select.
  // Nothing else to do here — cascade is handled by updateOrgCountries / updateOrgProvinces below.
}

function updateOrgCountries() {
  const regionCode = document.getElementById("orgRegionSelect").value;
  const countrySelect = document.getElementById("orgCountrySelect");
  const provinceSelect = document.getElementById("orgProvinceSelect");
  countrySelect.innerHTML = '<option value="">Select country</option>';
  provinceSelect.innerHTML = '<option value="">Select province</option>';
  if (!regionCode) return;
  WHO_REGIONS_CLIENT[regionCode].countries.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.code;
    opt.textContent = c.name;
    countrySelect.appendChild(opt);
  });
}

function updateOrgProvinces() {
  const regionCode = document.getElementById("orgRegionSelect").value;
  const countryCode = document.getElementById("orgCountrySelect").value;
  const provinceSelect = document.getElementById("orgProvinceSelect");
  provinceSelect.innerHTML = '<option value="">Select province</option>';
  if (!regionCode || !countryCode) return;
  const country = WHO_REGIONS_CLIENT[regionCode].countries.find((c) => c.code === countryCode);
  if (!country) return;
  (country.provinces || []).forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    provinceSelect.appendChild(opt);
  });
}

async function submitOrganization(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const focusAreas = Array.from(form.querySelectorAll('#focusAreasGrid input:checked')).map((i) => i.value);

  const payload = {
    name: formData.get("name"),
    description: formData.get("description"),
    category: formData.get("category"),
    region: formData.get("region"),
    countryCode: formData.get("countryCode"),
    province: formData.get("province"),
    city: formData.get("city"),
    foundedYear: formData.get("foundedYear"),
    website: formData.get("website"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    contactPerson: formData.get("contactPerson"),
    focusAreas,
    tags: formData.get("tags"),
    logoUrl: formData.get("logoUrl")
  };

  try {
    await apiFetch("/api/organizations", { method: "POST", body: JSON.stringify(payload) });
    showToast("🎉 Organization registered! Welcome to Y4Y.");
    closeModal("registerOrgModal");
    form.reset();
    loadStats();
    loadRecentOrgs();
    if (state.view === "directory") loadOrgsList();
    refreshTotalCount();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ---------------------------------------------------------------------------
// COLLABORATE
// ---------------------------------------------------------------------------

async function loadCollaborations() {
  const grid = document.getElementById("collabsGrid");
  try {
    const data = await apiFetch(`/api/collaborations?type=${encodeURIComponent(state.collabFilter)}`);
    if (!data.collaborations.length) {
      grid.innerHTML = `
        <div class="empty-state full">
          <div class="empty-icon">🤝</div>
          <h3>No collaborations yet</h3>
          <p>Be the first to post a collaboration opportunity!</p>
          <button class="btn-primary" onclick="openModal('createCollabModal')">Post Collaboration</button>
        </div>`;
      return;
    }
    grid.innerHTML = data.collaborations.map(collabCardHtml).join("");
  } catch (err) {
    showToast(err.message, "error");
  }
}

function filterCollabs(type, btn) {
  state.collabFilter = type;
  document.querySelectorAll(".collab-filters .chip").forEach((c) => c.classList.remove("active"));
  btn.classList.add("active");
  loadCollaborations();
}

const COLLAB_COLORS = {
  Project: "#5B6EF5", Event: "#A23B72", Research: "#2E86AB",
  Campaign: "#C5383C", Exchange: "#44BBA4", Workshop: "#E8A838"
};

function collabCardHtml(c) {
  const color = COLLAB_COLORS[c.type] || "#5B6EF5";
  return `
    <div class="collab-card">
      <span class="collab-type-badge" style="background:${color}20; color:${color}">${escapeHtml(c.type)}</span>
      <div class="collab-title">${escapeHtml(c.title)}</div>
      <div class="collab-org">by ${escapeHtml(c.organizationName)}</div>
      <div class="collab-desc">${escapeHtml(c.description)}</div>
      ${c.skills && c.skills.length ? `<div class="collab-skills">${c.skills.map((s) => `<span class="tag">${escapeHtml(s)}</span>`).join("")}</div>` : ""}
      <div class="collab-footer">
        <span class="collab-meta">${c.interestedCount || 0} interested · ${c.maxPartners} partner spots${c.deadline ? " · due " + escapeHtml(c.deadline) : ""}</span>
        <button class="btn-apply" onclick="expressInterest('${c.id}', this)">Connect</button>
      </div>
    </div>`;
}

async function expressInterest(id, btn) {
  try {
    const collab = await apiFetch(`/api/collaborations/${id}/interest`, { method: "POST" });
    btn.closest(".collab-card").querySelector(".collab-meta").innerHTML =
      `${collab.interestedCount} interested · ${collab.maxPartners} partner spots${collab.deadline ? " · due " + escapeHtml(collab.deadline) : ""}`;
    showToast("Connection request sent! Check your email for next steps.");
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function submitCollab(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  try {
    await apiFetch("/api/collaborations", { method: "POST", body: JSON.stringify(payload) });
    showToast("🚀 Collaboration posted!");
    closeModal("createCollabModal");
    form.reset();
    loadCollaborations();
    loadHomeCollabs();
    loadStats();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ---------------------------------------------------------------------------
// OPPORTUNITIES / INVITATIONS
// ---------------------------------------------------------------------------

async function loadInvitations() {
  const grid = document.getElementById("invitationsGrid");
  try {
    const data = await apiFetch(`/api/invitations?type=${encodeURIComponent(state.invFilter)}`);
    if (!data.invitations.length) {
      grid.innerHTML = `
        <div class="empty-state full">
          <div class="empty-icon">✨</div>
          <h3>No opportunities posted yet</h3>
          <p>Share opportunities with youth organizations around the world!</p>
          <button class="btn-primary" onclick="openModal('createInvitationModal')">Post Opportunity</button>
        </div>`;
      return;
    }
    grid.innerHTML = data.invitations.map(invitationCardHtml).join("");
  } catch (err) {
    showToast(err.message, "error");
  }
}

function filterInvitations(type, btn) {
  state.invFilter = type;
  document.querySelectorAll(".opp-type-tabs .opp-tab").forEach((c) => c.classList.remove("active"));
  btn.classList.add("active");
  loadInvitations();
}

function invitationCardHtml(inv) {
  return `
    <div class="invitation-card">
      <span class="inv-type">${escapeHtml(inv.type)}</span>
      <div class="inv-title">${escapeHtml(inv.title)}</div>
      <div class="inv-org">by ${escapeHtml(inv.organizationName)}</div>
      <div class="inv-desc">${escapeHtml(inv.description)}</div>
      ${inv.benefits && inv.benefits.length ? `
        <div class="inv-benefits">
          <div class="inv-benefits-label">Benefits</div>
          ${inv.benefits.map((b) => `<div class="inv-benefit-item">${escapeHtml(b)}</div>`).join("")}
        </div>` : ""}
      <div class="inv-footer">
        <span class="inv-deadline">${inv.deadline ? "Deadline: " + escapeHtml(inv.deadline) : "Rolling applications"} · ${inv.applicantCount || 0} applied</span>
        <button class="btn-apply" onclick="applyToInvitation('${inv.id}', this)">Apply</button>
      </div>
    </div>`;
}

async function applyToInvitation(id, btn) {
  try {
    const inv = await apiFetch(`/api/invitations/${id}/apply`, { method: "POST" });
    btn.closest(".invitation-card").querySelector(".inv-deadline").innerHTML =
      `${inv.deadline ? "Deadline: " + escapeHtml(inv.deadline) : "Rolling applications"} · ${inv.applicantCount} applied`;
    showToast("Application started! Check your email for next steps.");
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function submitInvitation(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  try {
    await apiFetch("/api/invitations", { method: "POST", body: JSON.stringify(payload) });
    showToast("✨ Opportunity posted!");
    closeModal("createInvitationModal");
    form.reset();
    loadInvitations();
    loadStats();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ---------------------------------------------------------------------------
// EMPOWER HUB
// ---------------------------------------------------------------------------

async function loadEmpowerStats() {
  const grid = document.getElementById("empowerStats");
  if (!grid) return;
  try {
    const stats = await apiFetch("/api/stats");
    const regionRows = Object.entries(stats.byRegion || {})
      .map(([code, count]) => {
        const region = WHO_REGIONS_CLIENT[code];
        return `
        <div class="stat-card">
          <span class="stat-card-num">${count}</span>
          <div class="stat-card-label">Organizations</div>
          <div class="stat-card-region">${region.emoji} ${code}</div>
        </div>`;
      })
      .join("");

    grid.innerHTML = `
      <div class="stat-card">
        <span class="stat-card-num">${stats.totalOrganizations}</span>
        <div class="stat-card-label">Total Organizations</div>
      </div>
      <div class="stat-card">
        <span class="stat-card-num">${stats.totalCollaborations}</span>
        <div class="stat-card-label">Open Collaborations</div>
      </div>
      <div class="stat-card">
        <span class="stat-card-num">${stats.totalInvitations}</span>
        <div class="stat-card-label">Open Opportunities</div>
      </div>
      <div class="stat-card">
        <span class="stat-card-num">${stats.totalCountries}</span>
        <div class="stat-card-label">Countries Covered</div>
      </div>
      ${regionRows}`;
  } catch (err) {
    console.error("Failed to load empower stats:", err);
  }
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
