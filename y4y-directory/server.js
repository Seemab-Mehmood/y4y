// server.js — Y4Y Directory backend
// Ready to run: `npm install && npm start`, then open http://localhost:3000

const express = require("express");
const cors = require("cors");
const path = require("path");
const { readDb, writeDb } = require("./db");
const WHO_REGIONS = require("./public/js/regions-data.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------------------------
// Helpers & State Verification Caches
// ---------------------------------------------------------------------------

// 🆕 ADDED: Memory cache mapping for temporary verification states
const verificationCache = new Map();

function findCountry(countryCode) {
  for (const regionKey of Object.keys(WHO_REGIONS)) {
    const region = WHO_REGIONS[regionKey];
    const country = region.countries.find((c) => c.code === countryCode);
    if (country) return { region, country };
  }
  return null;
}

function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

function notFound(res, message) {
  return res.status(404).json({ error: message || "Not found" });
}

// ---------------------------------------------------------------------------
// Regions / Countries
// ---------------------------------------------------------------------------

app.get("/api/regions", (req, res) => {
  res.json(WHO_REGIONS);
});

app.get("/api/regions/:regionCode/countries", (req, res) => {
  const region = WHO_REGIONS[req.params.regionCode];
  if (!region) return notFound(res, "Region not found");
  res.json(region.countries);
});

// ---------------------------------------------------------------------------
// 🆕 ADDED: Authentication & Security Tokens (OTP Flow)
// ---------------------------------------------------------------------------

app.post("/api/auth/send-verification-otp", (req, res) => {
  const { email } = req.body;
  if (!email) return badRequest(res, "Email address is required.");

  // Generate an arbitrary 6-digit verification code string
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  
  // Cache data entry with a 10-minute automated expiry clock
  verificationCache.set(email.toLowerCase().trim(), {
    otp: otp,
    expiresAt: Date.now() + 10 * 60 * 1000 
  });

  // PRINTING LIVE CODE DIRECTLY INTO YOUR TERMINAL LOG:
  console.log(`\n============================================`);
  console.log(`📧 Y4Y DISPATCH FOR: ${email}`);
  console.log(`🔑 SECURE 6-DIGIT CODE IS: ${otp}`);
  console.log(`============================================\n`);

  res.json({ success: true, message: "Verification dispatch sequence initialized." });
});

app.post("/api/auth/verify-otp", (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return badRequest(res, "Missing parameter parameters.");

  const cachedRecord = verificationCache.get(email.toLowerCase().trim());
  if (!cachedRecord) return badRequest(res, "No validation lifecycle found for this email profile.");

  if (Date.now() > cachedRecord.expiresAt) {
    verificationCache.delete(email.toLowerCase().trim());
    return badRequest(res, "Your verification code has expired. Please try again.");
  }

  if (cachedRecord.otp !== String(otp).trim()) {
    return badRequest(res, "Incorrect code entered. Please check and try again.");
  }

  // Tokens match up cleanly. Flush structural caching state and authorize submission
  verificationCache.delete(email.toLowerCase().trim());
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Organizations (Directory)
// ---------------------------------------------------------------------------

app.get("/api/organizations", (req, res) => {
  const db = readDb();
  
  // 🔄 MODIFIED: Only filter and show items that have passed admin approval layout metrics
  let list = db.organizations.filter((o) => o.verified === true);

  // Filters
  if (req.query.region) {
    list = list.filter((o) => o.region === req.query.region);
  }
  if (req.query.countryCode) {
    list = list.filter((o) => o.countryCode === req.query.countryCode);
  }
  if (req.query.category) {
    list = list.filter((o) => o.category === req.query.category);
  }
  if (req.query.city) {
    const c = req.query.city.toLowerCase();
    list = list.filter((o) => o.city && o.city.toLowerCase().includes(c));
  }
  if (req.query.search) {
    const q = req.query.search.toLowerCase();
    list = list.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.description && o.description.toLowerCase().includes(q))
    );
  }

  // Sort
  if (req.query.sort === "name") {
    list.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    // default: newest
    list.sort((a, b) => b.id - a.id);
  }

  // Pagination
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 12;
  const total = list.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const paginated = list.slice(start, start + limit);

  res.json({
    total,
    page,
    limit,
    totalPages,
    organizations: paginated
  });
});

app.get("/api/organizations/:id", (req, res) => {
  const db = readDb();
  const org = db.organizations.find((o) => String(o.id) === req.params.id);
  if (!org) return notFound(res, "Organization not found");
  res.json(org);
});

app.post("/api/organizations", async (req, res) => {
  const { name, description, category, region, countryCode, email } = req.body;
  if (!name || !description || !category || !region || !countryCode || !email) {
    return badRequest(res, "Missing required fields");
  }

  const geo = findCountry(countryCode);
  if (!geo) return badRequest(res, "Invalid country code");

  const db = readDb();
  const newId = String(db.nextOrgId || (db.organizations.length + 1));

  const org = {
    id: newId,
    name,
    description,
    category,
    region,
    regionName: geo.region.name,
    countryCode,
    countryName: geo.country.name,
    province: req.body.province || "",
    city: req.body.city || "",
    foundedYear: req.body.foundedYear || "",
    website: req.body.website || "",
    email,
    phone: req.body.phone || "",
    contactPerson: req.body.contactPerson || "",
    focusAreas: Array.isArray(req.body.focusAreas) ? req.body.focusAreas : [],
    tags: req.body.tags ? req.body.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    logoUrl: req.body.logoUrl || "",
    verified: false, // Starts as pending unverified review hold
    createdAt: new Date().toISOString()
  };

  db.organizations.push(org);
  db.nextOrgId = (db.nextOrgId || db.organizations.length) + 1;
  await writeDb(db);

  res.status(201).json(org);
});

// ---------------------------------------------------------------------------
// Collaborations
// ---------------------------------------------------------------------------

app.get("/api/collaborations", (req, res) => {
  const db = readDb();
  let list = [...db.collaborations];
  if (req.query.type && req.query.type !== "all") {
    list = list.filter((c) => c.type === req.query.type);
  }
  list.sort((a, b) => b.id - a.id);
  res.json({ collaborations: list });
});

app.post("/api/collaborations", async (req, res) => {
  const { title, organizationName, type, description } = req.body;
  if (!title || !organizationName || !type || !description) {
    return badRequest(res, "Missing required collaboration fields");
  }

  const db = readDb();
  const newId = String(db.nextCollabId || 1);

  const collab = {
    id: newId,
    title,
    organizationName,
    type,
    description,
    skills: req.body.skills ? req.body.skills.split(",").map((s) => s.trim()).filter(Boolean) : [],
    maxPartners: parseInt(req.body.maxPartners) || 1,
    deadline: req.body.deadline || "",
    interestedCount: 0,
    createdAt: new Date().toISOString()
  };

  db.collaborations.push(collab);
  db.nextCollabId = (db.nextCollabId || 1) + 1;
  await writeDb(db);

  res.status(201).json(collab);
});

app.post("/api/collaborations/:id/interest", async (req, res) => {
  const db = readDb();
  const collab = db.collaborations.find((c) => String(c.id) === req.params.id);
  if (!collab) return notFound(res, "Collaboration not found");
  collab.interestedCount = (collab.interestedCount || 0) + 1;
  await writeDb(db);
  res.json(collab);
});

// ---------------------------------------------------------------------------
// Opportunities (Invitations)
// ---------------------------------------------------------------------------

app.get("/api/invitations", (req, res) => {
  const db = readDb();
  let list = [...db.invitations];
  if (req.query.type && req.query.type !== "all") {
    list = list.filter((i) => i.type === req.query.type);
  }
  list.sort((a, b) => b.id - a.id);
  res.json({ invitations: list });
});

app.post("/api/invitations", async (req, res) => {
  const { title, organizationName, type, description } = req.body;
  if (!title || !organizationName || !type || !description) {
    return badRequest(res, "Missing required opportunity fields");
  }

  const db = readDb();
  const newId = String(db.nextInvId || 1);

  const inv = {
    id: newId,
    title,
    organizationName,
    type,
    description,
    benefits: req.body.benefits ? req.body.benefits.split(",").map((b) => b.trim()).filter(Boolean) : [],
    deadline: req.body.deadline || "",
    applicantCount: 0,
    createdAt: new Date().toISOString()
  };

  db.invitations.push(inv);
  db.nextInvId = (db.nextInvId || 1) + 1;
  await writeDb(db);

  res.status(201).json(inv);
});

app.post("/api/invitations/:id/apply", async (req, res) => {
  const db = readDb();
  const inv = db.invitations.find((i) => String(i.id) === req.params.id);
  if (!inv) return notFound(res, "Invitation not found");
  inv.applicantCount = (inv.applicantCount || 0) + 1;
  await writeDb(db);
  res.json(inv);
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

app.get("/api/stats", (req, res) => {
  const db = readDb();
  const byRegion = {};
  for (const regionKey of Object.keys(WHO_REGIONS)) {
    byRegion[regionKey] = db.organizations.filter((o) => o.region === regionKey).length;
  }
  res.json({
    totalOrganizations: db.organizations.length,
    totalCollaborations: db.collaborations.length,
    totalInvitations: db.invitations.length,
    totalCountries: 195,
    totalRegions: 6,
    byRegion
  });
});

// ---------------------------------------------------------------------------
// 👑 Super Admin Dashboard Panel (Master Control Layout)
// ---------------------------------------------------------------------------

app.get('/admin-panel', async (req, res) => {
  const password = req.query.secret;
  const correctPassword = process.env.ADMIN_PASSWORD;

  if (!correctPassword || password !== correctPassword) {
    return res.status(403).send('<h1>Access Denied: Invalid Secret Key.</h1>');
  }

  const db = readDb();
  const organizations = db.organizations || [];
  const collaborations = db.collaborations || [];
  const invitations = db.invitations || [];

  // --- 1. BUILD ORGANIZATIONS TABLE ROWS ---
  let orgRows = '';
  if (organizations.length === 0) {
    orgRows = `<tr><td colspan="5" style="text-align:center; padding:15px; color:#999;">No directory registries found.</td></tr>`;
  } else {
    organizations.forEach((item) => {
      const status = item.verified 
        ? '<span style="color: #28a745; font-weight: bold;">✅ Verified</span>' 
        : '<span style="color: #fd7e14; font-weight: bold;">⏳ Pending Review</span>';
      orgRows += `
        <tr style="border-bottom: 1px solid #ddd;">
          <td style="padding: 10px; font-family: monospace; font-size:12px;">${item.id}</td>
          <td style="padding: 10px;"><strong>${item.name}</strong><br><small style="color:#666">${item.email}</small></td>
          <td style="padding: 10px;"><span style="background:#eef; padding:2px 6px; border-radius:4px; font-size:12px;">${item.regionName || item.region || 'Global'}</span></td>
          <td style="padding: 10px;">${status}</td>
          <td style="padding: 10px;">
            ${!item.verified ? `
            <form action="/admin/verify/org/${item.id}?secret=${password}" method="POST" style="display:inline; margin-right:5px;">
              <button style="background: #28a745; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Verify</button>
            </form>` : ''}
            <form action="/admin/delete/org/${item.id}?secret=${password}" method="POST" style="display:inline;" onsubmit="return confirm('Delete this directory listing permanently?');">
              <button style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Delete</button>
            </form>
          </td>
        </tr>`;
    });
  }

  // --- 2. BUILD COLLABORATIONS TABLE ROWS ---
  let collabRows = '';
  if (collaborations.length === 0) {
    collabRows = `<tr><td colspan="4" style="text-align:center; padding:15px; color:#999;">No collaboration proposals posted.</td></tr>`;
  } else {
    collaborations.forEach((item) => {
      collabRows += `
        <tr style="border-bottom: 1px solid #ddd;">
          <td style="padding: 10px; font-family: monospace; font-size:12px;">${item.id}</td>
          <td style="padding: 10px;"><strong>${item.title}</strong><br><small style="color:#666">By: ${item.organizationName}</small></td>
          <td style="padding: 10px;"><span style="background:#eafaf1; color:#257a48; padding:2px 6px; border-radius:4px; font-size:12px;">${item.type}</span></td>
          <td style="padding: 10px;">
            <form action="/admin/delete/collab/${item.id}?secret=${password}" method="POST" style="display:inline;" onsubmit="return confirm('Delete this collaboration post?');">
              <button style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Delete</button>
            </form>
          </td>
        </tr>`;
    });
  }

  // --- 3. BUILD OPPORTUNITIES TABLE ROWS ---
  let invRows = '';
  if (invitations.length === 0) {
    invRows = `<tr><td colspan="4" style="text-align:center; padding:15px; color:#999;">No opportunities active.</td></tr>`;
  } else {
    invitations.forEach((item) => {
      invRows += `
        <tr style="border-bottom: 1px solid #ddd;">
          <td style="padding: 10px; font-family: monospace; font-size:12px;">${item.id}</td>
          <td style="padding: 10px;"><strong>${item.title}</strong><br><small style="color:#666">By: ${item.organizationName}</small></td>
          <td style="padding: 10px;"><span style="background:#fef9e7; color:#b7950b; padding:2px 6px; border-radius:4px; font-size:12px;">${item.type}</span></td>
          <td style="padding: 10px;">
            <form action="/admin/delete/inv/${item.id}?secret=${password}" method="POST" style="display:inline;" onsubmit="return confirm('Delete this opportunity?');">
              <button style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Delete</button>
            </form>
          </td>
        </tr>`;
    });
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Y4Y Central Command</title></head>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 30px;">
        <div style="max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eaeaea; padding-bottom: 20px; margin-bottom: 30px;">
                <h2 style="margin: 0; color: #2c3e50;">👑 Y4Y Platform — Global Control Center</h2>
                <span style="background: #dc3545; color: white; padding: 6px 14px; border-radius: 20px; font-weight:bold; font-size: 13px;">Super Admin Connected</span>
            </div>
            <h3 style="color: #2c3e50; border-left: 4px solid #007bff; padding-left: 10px;">📁 1. Directory Registries (${organizations.length})</h3>
            <table style="width: 100%; border-collapse: collapse; text-align: left; margin-bottom: 40px; font-size: 14px;">
                <thead>
                    <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                        <th style="padding: 10px; width: 10%;">ID</th><th style="padding: 10px; width: 40%;">Organization</th><th style="padding: 10px; width: 20%;">WHO Region</th><th style="padding: 10px; width: 15%;">Status</th><th style="padding: 10px; width: 15%;">Actions</th>
                    </tr>
                </thead>
                <tbody>${orgRows}</tbody>
            </table>
            <h3 style="color: #2c3e50; border-left: 4px solid #28a745; padding-left: 10px;">🤝 2. Active Collaboration Proposals (${collaborations.length})</h3>
            <table style="width: 100%; border-collapse: collapse; text-align: left; margin-bottom: 40px; font-size: 14px;">
                <thead>
                    <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                        <th style="padding: 10px; width: 15%;">ID</th><th style="padding: 10px; width: 50%;">Project Title</th><th style="padding: 10px; width: 20%;">Type</th><th style="padding: 10px; width: 15%;">Actions</th>
                    </tr>
                </thead>
                <tbody>${collabRows}</tbody>
            </table>
            <h3 style="color: #2c3e50; border-left: 4px solid #ffc107; padding-left: 10px;">💡 3. Opportunity Hub Posts (${invitations.length})</h3>
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
                <thead>
                    <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                        <th style="padding: 10px; width: 15%;">ID</th><th style="padding: 10px; width: 50%;">Opportunity</th><th style="padding: 10px; width: 20%;">Type</th><th style="padding: 10px; width: 15%;">Actions</th>
                    </tr>
                </thead>
                <tbody>${invRows}</tbody>
            </table>
        </div>
    </body>
    </html>
  `);
});

// Admin Post Endpoints
app.post('/admin/verify/org/:id', async (req, res) => {
  if (req.query.secret !== process.env.ADMIN_PASSWORD) return res.status(403).send('Unauthorized');
  const db = readDb();
  const org = db.organizations.find((o) => String(o.id) === req.params.id);
  if (org) { org.verified = true; await writeDb(db); }
  res.redirect(`/admin-panel?secret=${req.query.secret}`);
});

app.post('/admin/delete/org/:id', async (req, res) => {
  if (req.query.secret !== process.env.ADMIN_PASSWORD) return res.status(403).send('Unauthorized');
  const db = readDb();
  db.organizations = db.organizations.filter((o) => String(o.id) !== req.params.id);
  await writeDb(db);
  res.redirect(`/admin-panel?secret=${req.query.secret}`);
});

app.post('/admin/delete/collab/:id', async (req, res) => {
  if (req.query.secret !== process.env.ADMIN_PASSWORD) return res.status(403).send('Unauthorized');
  const db = readDb();
  db.collaborations = db.collaborations.filter((c) => String(c.id) !== req.params.id);
  await writeDb(db);
  res.redirect(`/admin-panel?secret=${req.query.secret}`);
});

app.post('/admin/delete/inv/:id', async (req, res) => {
  if (req.query.secret !== process.env.ADMIN_PASSWORD) return res.status(403).send('Unauthorized');
  const db = readDb();
  db.invitations = db.invitations.filter((i) => String(i.id) !== req.params.id);
  await writeDb(db);
  res.redirect(`/admin-panel?secret=${req.query.secret}`);
});

// Fallback SPA Middleware
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/admin")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server handling cluster workflows cleanly on port ${PORT}`);
});
