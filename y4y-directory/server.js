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
// Helpers
// ---------------------------------------------------------------------------

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
  const region = WHO_REGIONS[req.params.regionCode.toUpperCase()];
  if (!region) return notFound(res, "Region not found");
  res.json(region.countries);
});

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

app.get("/api/organizations", (req, res) => {
  const db = readDb();
  let results = [...db.organizations];

  const { region, countryCode, category, city, search, sort } = req.query;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 12;

  if (region) results = results.filter((o) => o.region === region);
  if (countryCode) results = results.filter((o) => o.countryCode === countryCode);
  if (category) results = results.filter((o) => o.category === category);
  if (city) {
    const cityLower = city.toLowerCase();
    results = results.filter((o) => (o.city || "").toLowerCase().includes(cityLower));
  }
  if (search) {
    const q = search.toLowerCase();
    results = results.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.description || "").toLowerCase().includes(q) ||
        (o.tags || []).some((t) => t.toLowerCase().includes(q)) ||
        (o.focusAreas || []).some((f) => f.toLowerCase().includes(q))
    );
  }

  if (sort === "name") {
    results.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === "country") {
    results.sort((a, b) => (a.countryName || "").localeCompare(b.countryName || ""));
  } else {
    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // newest first (default)
  }

  const total = results.length;
  const start = (page - 1) * limit;
  const paged = results.slice(start, start + limit);

  res.json({
    organizations: paged,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit))
  });
});

app.get("/api/organizations/:id", (req, res) => {
  const db = readDb();
  const org = db.organizations.find((o) => o.id === req.params.id);
  if (!org) return notFound(res, "Organization not found");
  res.json(org);
});

app.post("/api/organizations", async (req, res) => {
  const body = req.body || {};
  const required = ["name", "description", "category", "region", "countryCode", "email"];
  for (const field of required) {
    if (!body[field] || String(body[field]).trim() === "") {
      return badRequest(res, `Field "${field}" is required.`);
    }
  }

  const match = findCountry(body.countryCode);
  if (!match) return badRequest(res, "Invalid country code.");
  if (match.region.code !== body.region) {
    return badRequest(res, "Country does not belong to the selected WHO region.");
  }

  const db = readDb();
  const id = `org_${db.nextOrgId}`;
  const org = {
    id,
    name: String(body.name).trim(),
    description: String(body.description).trim(),
    category: body.category,
    region: match.region.code,
    regionName: match.region.name,
    countryCode: match.country.code,
    countryName: match.country.name,
    province: body.province || "",
    city: body.city || "",
    foundedYear: body.foundedYear || null,
    website: body.website || "",
    email: body.email,
    phone: body.phone || "",
    contactPerson: body.contactPerson || "",
    focusAreas: Array.isArray(body.focusAreas) ? body.focusAreas : [],
    tags: typeof body.tags === "string"
      ? body.tags.split(",").map((t) => t.trim()).filter(Boolean)
      : Array.isArray(body.tags) ? body.tags : [],
    logoUrl: body.logoUrl || "",
    verified: false,
    createdAt: new Date().toISOString()
  };

  db.organizations.push(org);
  db.nextOrgId += 1;
  await writeDb(db);

  res.status(201).json(org);
});

// ---------------------------------------------------------------------------
// Collaborations
// ---------------------------------------------------------------------------

app.get("/api/collaborations", (req, res) => {
  const db = readDb();
  let results = [...db.collaborations];
  const { type } = req.query;
  if (type && type !== "all") results = results.filter((c) => c.type === type);
  results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ collaborations: results, total: results.length });
});

app.get("/api/collaborations/:id", (req, res) => {
  const db = readDb();
  const collab = db.collaborations.find((c) => c.id === req.params.id);
  if (!collab) return notFound(res, "Collaboration not found");
  res.json(collab);
});

app.post("/api/collaborations", async (req, res) => {
  const body = req.body || {};
  const required = ["title", "type", "description", "organizationName", "contactEmail"];
  for (const field of required) {
    if (!body[field] || String(body[field]).trim() === "") {
      return badRequest(res, `Field "${field}" is required.`);
    }
  }

  const db = readDb();
  const id = `collab_${db.nextCollabId}`;
  const collab = {
    id,
    title: body.title.trim(),
    type: body.type,
    description: body.description.trim(),
    organizationName: body.organizationName.trim(),
    contactEmail: body.contactEmail,
    maxPartners: body.maxPartners ? parseInt(body.maxPartners, 10) : 5,
    interestedCount: 0,
    deadline: body.deadline || null,
    skills: typeof body.skills === "string"
      ? body.skills.split(",").map((s) => s.trim()).filter(Boolean)
      : Array.isArray(body.skills) ? body.skills : [],
    createdAt: new Date().toISOString()
  };

  db.collaborations.push(collab);
  db.nextCollabId += 1;
  await writeDb(db);

  res.status(201).json(collab);
});

// Express interest in a collaboration (the "connect" action)
app.post("/api/collaborations/:id/interest", async (req, res) => {
  const db = readDb();
  const collab = db.collaborations.find((c) => c.id === req.params.id);
  if (!collab) return notFound(res, "Collaboration not found");
  collab.interestedCount = (collab.interestedCount || 0) + 1;
  await writeDb(db);
  res.json(collab);
});

// ---------------------------------------------------------------------------
// 👑 Super Admin Dashboard Panel (Master Control for All Features)
// ---------------------------------------------------------------------------

app.get('/admin-panel', async (req, res) => {
  const password = req.query.secret;
  const correctPassword = process.env.ADMIN_PASSWORD;

  if (!correctPassword || password !== correctPassword) {
    return res.status(403).send('<h1>Access Denied: Invalid Secret Key.</h1>');
  }

  // Read all live data collections from your cloud sync db
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
        : '<span style="color: #fd7e14; font-weight: bold;">⏳ Pending 24h</span>';
      orgRows += `
        <tr style="border-bottom: 1px solid #ddd;">
          <td style="padding: 10px; font-family: monospace; font-size:12px;">${item.id}</td>
          <td style="padding: 10px;"><strong>${item.name}</strong><br><small style="color:#666">${item.email}</small></td>
          <td style="padding: 10px;"><span style="background:#eef; padding:2px 6px; border-radius:4px; font-size:12px;">${item.regionName || item.region || 'Global'}</span></td>
          <td style="padding: 10px;">${status}</td>
          <td style="padding: 10px;">
            ${!item.verified ? `
            <form action="/admin/verify/org/${item.id}?secret=${password}" method="POST" style="display:inline;">
              <button style="background: #28a745; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Verify</button>
            </form>` : ''}
            <form action="/admin/delete/org/${item.id}?secret=${password}" method="POST" style="display:inline;" onsubmit="return confirm('Delete this directory listing?');">
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

  // --- 3. BUILD OPPORTUNITIES / INVITATIONS TABLE ROWS ---
  let invRows = '';
  if (invitations.length === 0) {
    invRows = `<tr><td colspan="4" style="text-align:center; padding:15px; color:#999;">No opportunities or invitations active.</td></tr>`;
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

  // --- MAIN ADMIN HTML VIEW ---
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Y4Y Central Command</title>
    </head>
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
                        <th style="padding: 10px; width: 10%;">ID</th>
                        <th style="padding: 10px; width: 40%;">Organization</th>
                        <th style="padding: 10px; width: 20%;">WHO Region</th>
                        <th style="padding: 10px; width: 15%;">Verification Status</th>
                        <th style="padding: 10px; width: 15%;">Actions</th>
                    </tr>
                </thead>
                <tbody>${orgRows}</tbody>
            </table>

            <h3 style="color: #2c3e50; border-left: 4px solid #28a745; padding-left: 10px;">🤝 2. Active Collaboration Proposals (${collaborations.length})</h3>
            <table style="width: 100%; border-collapse: collapse; text-align: left; margin-bottom: 40px; font-size: 14px;">
                <thead>
                    <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                        <th style="padding: 10px; width: 15%;">ID</th>
                        <th style="padding: 10px; width: 50%;">Project Title & Submitter</th>
                        <th style="padding: 10px; width: 20%;">Collaboration Type</th>
                        <th style="padding: 10px; width: 15%;">Actions</th>
                    </tr>
                </thead>
                <tbody>${collabRows}</tbody>
            </table>

            <h3 style="color: #2c3e50; border-left: 4px solid #ffc107; padding-left: 10px;">💡 3. Opportunity Hub Posts (${invitations.length})</h3>
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
                <thead>
                    <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                        <th style="padding: 10px; width: 15%;">ID</th>
                        <th style="padding: 10px; width: 50%;">Opportunity Title</th>
                        <th style="padding: 10px; width: 20%;">Listing Type</th>
                        <th style="padding: 10px; width: 15%;">Actions</th>
                    </tr>
                </thead>
                <tbody>${invRows}</tbody>
            </table>

        </div>
    </body>
    </html>
  `);
});

// ---------------------------------------------------------------------------
// Action Handlers
// ---------------------------------------------------------------------------

// Verify an Organization
app.post('/admin/verify/org/:id', async (req, res) => {
  if (req.query.secret !== process.env.ADMIN_PASSWORD) return res.status(403).send('Unauthorized');
  const db = readDb();
  const org = db.organizations.find((o) => o.id === req.params.id);
  if (org) { org.verified = true; await writeDb(db); }
  res.redirect(`/admin-panel?secret=${req.query.secret}`);
});

// Delete an Organization
app.post('/admin/delete/org/:id', async (req, res) => {
  if (req.query.secret !== process.env.ADMIN_PASSWORD) return res.status(403).send('Unauthorized');
  const db = readDb();
  db.organizations = db.organizations.filter((o) => o.id !== req.params.id);
  await writeDb(db);
  res.redirect(`/admin-panel?secret=${req.query.secret}`);
});

// Delete a Collaboration Post
app.post('/admin/delete/collab/:id', async (req, res) => {
  if (req.query.secret !== process.env.ADMIN_PASSWORD) return res.status(403).send('Unauthorized');
  const db = readDb();
  db.collaborations = db.collaborations.filter((c) => c.id !== req.params.id);
  await writeDb(db);
  res.redirect(`/admin-panel?secret=${req.query.secret}`);
});

// Delete an Opportunity (Invitation) Post
app.post('/admin/delete/inv/:id', async (req, res) => {
  if (req.query.secret !== process.env.ADMIN_PASSWORD) return res.status(403).send('Unauthorized');
  const db = readDb();
  db.invitations = db.invitations.filter((i) => i.id !== req.params.id);
  await writeDb(db);
  res.redirect(`/admin-panel?secret=${req.query.secret}`);
});
// ---------------------------------------------------------------------------
// Invitations / Opportunities
// ---------------------------------------------------------------------------

app.get("/api/invitations", (req, res) => {
  const db = readDb();
  let results = [...db.invitations];
  const { type } = req.query;
  if (type && type !== "all") results = results.filter((i) => i.type === type);
  results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ invitations: results, total: results.length });
});

app.get("/api/invitations/:id", (req, res) => {
  const db = readDb();
  const inv = db.invitations.find((i) => i.id === req.params.id);
  if (!inv) return notFound(res, "Invitation not found");
  res.json(inv);
});

app.post("/api/invitations", async (req, res) => {
  const body = req.body || {};
  const required = ["title", "type", "description", "organizationName", "contactEmail"];
  for (const field of required) {
    if (!body[field] || String(body[field]).trim() === "") {
      return badRequest(res, `Field "${field}" is required.`);
    }
  }

  const db = readDb();
  const id = `inv_${db.nextInvId}`;
  const inv = {
    id,
    title: body.title.trim(),
    type: body.type,
    description: body.description.trim(),
    organizationName: body.organizationName.trim(),
    contactEmail: body.contactEmail,
    benefits: typeof body.benefits === "string"
      ? body.benefits.split("\n").map((b) => b.trim()).filter(Boolean)
      : Array.isArray(body.benefits) ? body.benefits : [],
    requirements: typeof body.requirements === "string"
      ? body.requirements.split("\n").map((r) => r.trim()).filter(Boolean)
      : Array.isArray(body.requirements) ? body.requirements : [],
    deadline: body.deadline || null,
    applicantCount: 0,
    createdAt: new Date().toISOString()
  };

  db.invitations.push(inv);
  db.nextInvId += 1;
  await writeDb(db);

  res.status(201).json(inv);
});

app.post("/api/invitations/:id/apply", async (req, res) => {
  const db = readDb();
  const inv = db.invitations.find((i) => i.id === req.params.id);
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
    totalCountries: 205,
    totalRegions: 6,
    byRegion
  });
});

// ---------------------------------------------------------------------------
// Fallback to SPA index.html for any non-API route
// ---------------------------------------------------------------------------

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n🌍  Y4Y Directory running at http://localhost:${PORT}\n`);
});
