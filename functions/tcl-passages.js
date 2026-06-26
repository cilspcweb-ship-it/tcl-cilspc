// tcl-passages.js -- Cloudflare Pages Function
// Endpoint officiel CONFIRME fonctionnel : tcl_sytral (sans le S, pas "systral")
// Table verifiee via tcl_sytral.tclarret (referentiel arrets) le 26/06/2026
// CORRECTION 26/06/2026 : ajout ID 46049 (A:A) sur Ampere - Victor Hugo
// CORRECTION 26/06/2026 : normalisation directions A/T1/T2 -> terminus reels uniquement

const ARRETS = {
  "Perrache":                [33765,33767,33779,30459,32103,32102,30101],
  "Confluence":              [17397,46179],
  "Sainte-Blandine":        [32138,46159,46160,34836,34837],
  "Hotel Region Montrochet":[43835,43836,43838,45378,34874,34875,50432],
  "Musee des Confluences":  [2541,2542,2543,2545,46154,35094],
  "Montrochet":             [39134,39135],
  "Ampere - Victor Hugo":   [10698,42745,46049],
  "Charlemagne - C. Perier":[11898,30057],
  "Place des Archives":     [2933,2934,35580,34834,34835],
  "Claudius Collonge":      [46975,542],
};

const LIGNES_VALIDES = {
  "Perrache":                ["A","T1","T2","C19","JD10","JD231"],
  "Confluence":              ["S1","NAVI1"],
  "Sainte-Blandine":        ["T1","T2"],
  "Hotel Region Montrochet":["T1","T2","S1","63","JD973"],
  "Musee des Confluences":  ["T1","15","63","C10","C7","BRMB","JD10"],
  "Montrochet":             ["S1"],
  "Ampere - Victor Hugo":   ["A","S1"],
  "Charlemagne - C. Perier":["S1"],
  "Place des Archives":     ["T1","T2","S1","63","JD973"],
  "Claudius Collonge":      ["S1","63"],
};

// Sens par ID d'arret pour lignes A, T1, T2
// Verifie via referentiel tclarret le 26/06/2026
const SENS_PAR_ID = {
  // Ligne A
  30101: "A", // Perrache A:A
  30459: "R", // Perrache A:R
  42745: "R", // Ampere - Victor Hugo A:R
  46049: "A", // Ampere - Victor Hugo A:A
  // T1 et T2
  32103: "A", // Perrache T1:A T2:A
  32102: "R", // Perrache T1:R T2:R
  34834: "A", // Place des Archives T1:A T2:A
  34835: "R", // Place des Archives T1:R T2:R
  34836: "A", // Sainte-Blandine T1:A T2:A
  34837: "R", // Sainte-Blandine T1:R T2:R
  34874: "R", // Hotel Region Montrochet T1:R T2:R
  34875: "A", // Hotel Region Montrochet T1:A T2:A
  // T1 uniquement
  32138: "A", // IUT Feyssine T1:A
  46159: "A", // Debourg T1:A
  46160: "R", // Debourg T1:R
  46154: "R", // Musee des Confluences T1:R
  35094: "A", // Musee des Confluences T1:A
};

// Terminus reels par ligne et sens
const TERMINUS = {
  "A":  { "A": "Vaulx-en-Velin La Soie", "R": "Perrache" },
  "T1": { "A": "IUT Feyssine",            "R": "Debourg" },
  "T2": { "A": "Saint-Priest Bel Air",    "R": "Hotel Region Montrochet" },
};

// Valeurs considerees comme terminus valides (sans accents, minuscules)
const TERMINUS_VALIDES = {
  "A":  ["vaulx-en-velin la soie", "perrache"],
  "T1": ["iut feyssine", "debourg"],
  "T2": ["saint-priest bel air", "hotel region montrochet", "hôtel région montrochet"],
};

function normaliserStr(s) {
  return String(s || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function corrigerDirection(ligne, directionBrute, idArret) {
  const termValides = TERMINUS_VALIDES[ligne];
  if (!termValides) return directionBrute;
  if (termValides.includes(normaliserStr(directionBrute))) return directionBrute;
  const sens = SENS_PAR_ID[idArret];
  if (!sens) return directionBrute;
  return TERMINUS[ligne][sens];
}

function normaliserDirection(d) {
  return String(d || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:'"\-]/g, "");
}

function normaliserLigne(l) {
  return String(l || "").trim().toUpperCase();
}

const ALL_IDS = new Set(Object.values(ARRETS).flat());

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const user = context.env.GRANDLYON_USER || "demo";
    const pass = context.env.GRANDLYON_PASS || "demo4dev";
    const auth = "Basic " + btoa(`${user}:${pass}`);
    const apiHeaders = { "Authorization": auth, "Accept": "application/json" };

    const url = "https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_sytral.tclpassagearret/all.json?maxfeatures=9300&start=1&srsname=WGS84";
    const res = await fetch(url, { headers: apiHeaders });

    if (res.status === 401) throw new Error("Authentification refusee (401)");
    if (!res.ok) throw new Error("HTTP " + res.status);

    const body = await res.json();
    const values = body.values || [];

    if (values.length === 0) {
      return new Response(
        JSON.stringify({ poles: {}, alertes: [], maj: new Date().toISOString(), vide: true }),
        { status: 200, headers: CORS }
      );
    }

    const allPassages = [];
    for (const v of values) {
      const idDep = v.id;
      if (!ALL_IDS.has(idDep)) continue;
      const nomPole = Object.entries(ARRETS).find(([, ids]) => ids.includes(idDep))?.[0];
      if (!nomPole) continue;

      const ligne = normaliserLigne(v.ligne);
      if (!ligne) continue;

      const lignesAttendues = LIGNES_VALIDES[nomPole];
      if (lignesAttendues && lignesAttendues.length > 0 && !lignesAttendues.includes(ligne)) continue;

      let directionBrute = String(v.direction || "").trim();

      if (ligne === "A" || ligne === "T1" || ligne === "T2") {
        directionBrute = corrigerDirection(ligne, directionBrute, idDep);
      }

      const direction = normaliserDirection(directionBrute);
      const delaiStr = String(v.delaipassage || "0");
      let delai, delaiTexte;

      if (delaiStr === "Proche" || delaiStr === "proche") {
        delai = 0; delaiTexte = "A quai";
      } else {
        delai = parseInt(delaiStr, 10) || 0;
        if (delai <= 0) delaiTexte = "A quai";
        else if (delai < 60) delaiTexte = delai + " min";
        else {
          const h = Math.floor(delai / 60), m = delai % 60;
          delaiTexte = h + "h" + (m > 0 ? String(m).padStart(2, "0") : "");
        }
      }
      allPassages.push({ nomPole, ligne, direction, directionBrute, delai, delaiTexte });
    }

    allPassages.sort((a, b) => a.delai - b.delai);

    const poles = {};
    const vusStrict = new Set();
    const vusAQuaiParLigne = new Set();

    for (const p of allPassages) {
      const cleStricte = p.nomPole + "|" + p.ligne + "|" + p.direction;
      if (vusStrict.has(cleStricte)) continue;

      if (p.delai <= 0) {
        const cleAQuai = p.nomPole + "|" + p.ligne;
        if (vusAQuaiParLigne.has(cleAQuai)) continue;
        vusAQuaiParLigne.add(cleAQuai);
      }

      vusStrict.add(cleStricte);
      if (!poles[p.nomPole]) poles[p.nomPole] = [];
      poles[p.nomPole].push({ ligne: p.ligne, direction: p.directionBrute, delai: p.delai, delaiTexte: p.delaiTexte });
    }

    for (const nom of Object.keys(poles)) poles[nom].sort((a, b) => a.delai - b.delai);

    let alertes = [];
    try {
      const resA = await fetch(
        "https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_sytral.tclalertetrafic_2/all.json?maxfeatures=20&start=1&srsname=WGS84",
        { headers: apiHeaders }
      );
      if (resA.ok) {
        const bodyA = await resA.json();
        if (bodyA.values?.length) {
          alertes = bodyA.values.map(a => ({
            titre: a.titre || "",
            message: a.message || "",
            type: a.type || "Information",
            lignes: a.lignes ? String(a.lignes).split(",").map(l => l.trim()) : [],
          }));
        }
      }
    } catch (_) {}

    return new Response(
      JSON.stringify({ poles, alertes, maj: new Date().toISOString() }),
      { status: 200, headers: CORS }
    );

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message, poles: {}, alertes: [], maj: new Date().toISOString() }),
      { status: 200, headers: CORS }
    );
  }
}