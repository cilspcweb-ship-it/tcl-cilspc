// Cloudflare Pages Function — /functions/tcl-temps-reel.js
// Reçoit une liste d'IDs d'arrêts, retourne les prochains passages par ID
// Appelée par itineraire.html après que Dijkstra a trouvé le trajet

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    // Lire les IDs demandés depuis le body JSON
    const body = await context.request.json().catch(() => ({}));
    const ids = new Set((body.ids || []).map(Number).filter(Boolean));

    if (ids.size === 0) {
      return new Response(JSON.stringify({ passages: {}, erreur: "Aucun ID fourni" }), { status: 200, headers: CORS });
    }

    // Appel API Grand Lyon
    const user = context.env.GRANDLYON_USER || "demo";
    const pass = context.env.GRANDLYON_PASS || "demo4dev";
    const auth = "Basic " + btoa(`${user}:${pass}`);

    const res = await fetch(
      "https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_sytral.tclpassagearret/all.json?maxfeatures=9300&start=1&srsname=WGS84",
      { headers: { Authorization: auth, Accept: "application/json" } }
    );

    if (!res.ok) throw new Error("API Grand Lyon : HTTP " + res.status);
    const data = await res.json();
    const values = data.values || [];

    // Filtrer et grouper par ID d'arrêt
    const passages = {};
    for (const v of values) {
      const id = Number(v.id);
      if (!ids.has(id)) continue;

      const ligne = String(v.ligne || "").trim().toUpperCase();
      if (!ligne) continue;

      const delaiStr = String(v.delaipassage || "0").trim();
      let delai;
      if (delaiStr === "Proche" || delaiStr === "proche" || delaiStr === "A quai" || delaiStr === "0") {
        delai = 0;
      } else {
        // Gérer "41 min", "4h54", "41", etc.
        const parsed = parseInt(delaiStr, 10);
        if (!isNaN(parsed)) {
          // Si le format contient "h" c'est en heures → convertir
          if (delaiStr.toLowerCase().includes("h") && !delaiStr.toLowerCase().startsWith(parsed + " ")) {
            delai = parsed * 60 + (parseInt(delaiStr.split(/h/i)[1]) || 0);
          } else {
            delai = parsed;
          }
        } else {
          continue; // format inconnu, ignorer
        }
      }
      // Ignorer les passages trop lointains (> 90 min = probablement service de nuit suivant)
      if (delai > 90) continue;

      const direction = String(v.direction || "").trim();

      if (!passages[id]) passages[id] = [];
      passages[id].push({ ligne, direction, delai });
    }

    // Trier chaque liste par délai croissant
    for (const id of Object.keys(passages)) {
      passages[id].sort((a, b) => a.delai - b.delai);
    }

    return new Response(
      JSON.stringify({ passages, maj: new Date().toISOString() }),
      { status: 200, headers: CORS }
    );

  } catch (e) {
    return new Response(
      JSON.stringify({ passages: {}, erreur: e.message }),
      { status: 200, headers: CORS }
    );
  }
}
