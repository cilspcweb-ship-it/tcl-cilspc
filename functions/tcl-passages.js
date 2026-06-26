const ARRETS = {
  "Perrache": ["33765","33767","33779","30459","32103","32102"],
  "Confluence": ["17397","46179"],
  "Sainte-Blandine": ["32138","46159","46160","34836","34837"],
  "Hotel Region Montrochet": ["43835","43836","43838","45378","34874","34875","50432"],
  "Musee des Confluences": ["2541","2542","2543","2545","46154","35094"],
  "Montrochet": ["39134","39135"],
  "Ampere - Victor Hugo": ["10698","42745"],
  "Charlemagne - C. Perier": ["11898","30057"],
  "Place des Archives": ["2933","2934","35580","34834","34835"],
  "Claudius Collonge": ["46975","542"],
};

export async function onRequest(context) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  try {
    // Utilise les secrets Cloudflare
    const user = context.env.GRANDLYON_USER || "geryrotsaert@gmail.com";
    const pass = context.env.GRANDLYON_PASS || "Gery1612$";
    
    const auth = "Basic " + btoa(`${user}:${pass}`);
    
    const res = await fetch(
      "https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_systral.tclpassagearret/all.json?maxfeatures=9300&start=1",
      { headers: { "Authorization": auth, "Accept": "application/json" } }
    );
    
    if (res.status === 401) {
      return new Response(JSON.stringify({ error: "Auth échouée - vérifie tes identifiants" }), { 
        status: 401, headers 
      });
    }
    
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "HTTP " + res.status }), { 
        status: 500, headers 
      });
    }
    
    const data = await res.json();
    const values = data.values || [];
    const poles = {};
    let matchCount = 0;
    
    for (const v of values) {
      const idDep = String(v.id || "").trim();
      
      let nomPole = null;
      for (const [pole, ids] of Object.entries(ARRETS)) {
        if (ids.includes(idDep)) {
          nomPole = pole;
          break;
        }
      }
      
      if (!nomPole) continue;
      matchCount++;
      
      const ligne = String(v.ligne || "").trim().toUpperCase();
      const direction = String(v.direction || "").trim();
      const delaiStr = String(v.delaipassage || "0");
      
      let delai, delaiTexte;
      if (delaiStr === "Proche" || delaiStr === "proche") {
        delai = 0; delaiTexte = "À quai";
      } else {
        delai = parseInt(delaiStr, 10) || 0;
        if (delai <= 0) delaiTexte = "À quai";
        else if (delai < 60) delaiTexte = delai + " min";
        else {
          const h = Math.floor(delai / 60);
          const m = delai % 60;
          delaiTexte = h + "h" + (m > 0 ? String(m).padStart(2, "0") : "");
        }
      }
      
      if (!poles[nomPole]) poles[nomPole] = [];
      poles[nomPole].push({ ligne, direction, delai, delaiTexte });
    }
    
    for (const nom of Object.keys(poles)) {
      poles[nom].sort((a, b) => a.delai - b.delai);
      const seen = new Set();
      poles[nom] = poles[nom].filter(p => {
        const key = `${p.ligne}|${p.direction}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    
    return new Response(JSON.stringify({
      poles,
      alertes: [],
      maj: new Date().toISOString(),
      debug: { totalPassages: values.length, matchCount }
    }), { status: 200, headers });
    
  } catch (e) {
    return new Response(JSON.stringify({
      error: e.message,
      poles: {},
      alertes: [],
      maj: new Date().toISOString()
    }), { status: 200, headers });
  }
}