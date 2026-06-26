// Cloudflare Pages Function â€” port exact de tcl-passages-v8.js

const ARRETS = {
  "Perrache":[33765,33767,33779,30459,32103,32102,23467],
  "Confluence":              [17397,46179],
  "Sainte-Blandine":        [32138,46159,46160,34836,34837],
  "Hotel Region Montrochet":[43835,43836,43838,45378,34874,34875,50432],
  "Musee des Confluences":  [2541,2542,2543,2545,46154,35094],
  "Montrochet":             [39134,39135],
  "Ampere - Victor Hugo":   [10698,42745],
  "Charlemagne - C. Perier":[11898,30057],
  "Place des Archives":     [2933,2934,35580,34834,34835],
  "Claudius Collonge":      [46975,542],
};

const LIGNES_VALIDES = {
  "Perrache":["A","B","T1","T2","C20","C7","C9","18","63","91","3085","3086","3087","3083","3084","3082","3080","84","77","S8"],
  "Confluence":              ["T1","C20","C9"],
  "Sainte-Blandine":        ["T1","T2"],
  "Hotel Region Montrochet":["T1","T2"],
  "Musee des Confluences":  ["T1","C20"],
  "Montrochet":             ["T2"],
  "Ampere - Victor Hugo":   ["A","18","63"],
  "Charlemagne - C. Perier":["18","63"],
  "Place des Archives":     ["A","18"],
  "Claudius Collonge":      ["T1","T2"],
};

const ALL_IDS = new Set(Object.values(ARRETS).flat());

function normaliserDirection(d) {
  return String(d || "").trim().toUpperCase().replace(/\s+/g, " ").replace(/[.,;:'"\-]/g, "");
}

function normaliserLigne(l) {
  return String(l || "").trim().toUpperCase();
}

const CORS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const auth = "Basic " + btoa("demo:demo4dev");
    const apiHeaders = { "Authorization": auth, "Accept": "application/json" };

    const resP = await fetch(
      "https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_sytral.tclpassagearret/all.json?maxfeatures=9300&start=1&srsname=WGS84",
      { headers: apiHeaders, signal: AbortSignal.timeout(25000) }
    );
    if (resP.status === 401) throw new Error("Authentification refusee (401)");
    if (!resP.ok) throw new Error("HTTP " + resP.status);

    const bodyP = await resP.json();
    const values = bodyP.values || [];

    if (values.length === 0) {
      return new Response(JSON.stringify({ poles: {}, alertes: [], maj: new Date().toISOString(), vide: true }), { status: 200, headers: CORS });
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

      const directionBrute = String(v.direction || "").trim();
      const direction = normaliserDirection(v.direction);
      const delaiStr = String(v.delaipassage || "0");
      let delai, delaiTexte;
      if (delaiStr === "Proche" || delaiStr === "proche") {
        delai = 0; delaiTexte = "A quai";
      } else {
        delai = parseInt(delaiStr, 10) || 0;
        if (delai <= 0) delaiTexte = "A quai";
        else if (delai < 60) delaiTexte = delai + " min";
        else { const h = Math.floor(delai/60), m = delai%60; delaiTexte = h+"h"+(m>0?String(m).padStart(2,"0"):""); }
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
        { headers: apiHeaders, signal: AbortSignal.timeout(10000) }
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
    } catch(_) {}

    return new Response(JSON.stringify({ poles, alertes, maj: new Date().toISOString() }), { status: 200, headers: CORS });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message, poles: {}, alertes: [], maj: new Date().toISOString() }), { status: 200, headers: CORS });
  }
}
