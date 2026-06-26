// tcl-passages.js -- Cloudflare Pages Function
// Endpoint officiel CONFIRME fonctionnel : tcl_sytral (sans le S, pas "systral")
// Table verifiee via tcl_sytral.tclarret (referentiel arrets) le 26/06/2026
// CORRECTION 26/06/2026 : ajout ID 46049 (A:A sens Vaulx-en-Velin) sur Ampere - Victor Hugo
// CORRECTION 26/06/2026 : normalisation direction T2 (directions intermediaires -> terminus reel)

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

// Lignes reellement desservies par pole, VERIFIEES via le referentiel officiel
// tcl_sytral.tclarret (champ "desserte") le 26/06/2026.
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

// Terminus reels par ligne.
// Si la direction renvoyee par l'API n'est pas dans cette liste, on substitue
// le terminus oppose. Pour T2 dans ce quartier : terminus ouest = Hotel Region
// Montrochet, terminus est = Saint-Priest Bel Air.
const ALL_IDS = new Set(Object.values(ARRETS).flat());

const TERMINUS_T2 = ["saint-priest bel air", "hotel region montrochet", "hôtel région montrochet"];

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

function corrigerDirectionT2(directionBrute) {
  const d = String(directionBrute || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // retire accents
  for (const t of TERMINUS_T2) {
    const tNorm = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (d === tNorm) return directionBrute; // c'est deja un terminus, on garde
  }
  // Direction intermediaire : le tram va vers Saint-Priest Bel Air
  return "Saint-Priest Bel Air";
}

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

    // ENDPOINT CONFIRME FONCTIONNEL : tcl_sytral (sans le S)
    const url = "https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_sytral.tclpassagearret/all.json?maxfeatures=9300&start=1&srsname=WGS84";
    const res = await fetch(url, { headers: apiHeaders });

    if (res.status === 401) {
      throw new Error("Authentification refusee (401)");
    }
    if (!res.ok) {
      throw new Error("HTTP " + res.status);
    }

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
      if (lignesAttendues && lignesAttendues.length > 0 && !lignesAttendues.includes(ligne)) {
        continue;
      }

      let directionBrute = String(v.direction || "").trim();

      // Normalisation direction T2 : remplace les directions intermediaires par le terminus reel
      if (ligne === "T2") {
        directionBrute = corrigerDirectionT2(directionBrute);
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