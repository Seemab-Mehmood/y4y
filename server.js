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
