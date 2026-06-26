const ARRETS = {
  "Perrache": ["1384","1385","1386","1387","2582","2583","4381","4382"],
  "Confluence": ["3494","3495","3496","3497"],
  "Sainte-Blandine": ["1801","1802","1803","1804"],
  "Hôtel Région Montrochet": ["2691","2692","2693","2694"],
  "Musée des Confluences": ["3498","3499","3500","3501"],
  "Montrochet": ["2695","2696"],
  "Ampère - Victor Hugo": ["1388","1389","1390","1391"],
  "Charlemagne - C. Perier": ["1392","1393","1394","1395"],
  "Place des Archives": ["1396","1397","1398","1399"],
  "Claudius Collonge": ["2697","2698"],
};

export async function onRequest(context) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  try {
    const user = context.env.GRANDLYON_USER || "geryrotsaert@gmail.com";
    const pass = context.env.GRANDLYON_PASS || "Gery1612$";
    const auth = "Basic " + btoa(`${user}:${pass}`);
    
    const res = await fetch(
      "https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_systral.tclpassagearret/all.json?maxfeatures=50000&start=1",
      { headers: { "Authorization": auth, "Accept": "application/json" } }
    );
    
    if (res.status === 401) {
      return new Response(JSON.stringify({ error: "Auth échouée" }), { status: 401, headers });
    }
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "HTTP " + res.status }), { status: 500, headers });
    }
    
    const data = await res.json();
    const values = data.values || [];
    const poles = {};
    let matchCount = 0;
    
    for (const v of values) {
      const idArret = String(v.idtarretdestination || v.id || "").trim();
      
      let nomPole = null;
      for (const [pole, ids] of Object.entries(ARRETS)) {
        if (ids.includes(idArret)) {
          nomPole = pole;
          break;
        }
      }
      
      if (!nomPole) continue;
      matchCount++;
      
      const ligne = String(v.ligne || "").trim();
      const direction = String(v.direction || "").trim();
      const delai = parseInt(String(v.delaipassage || "0"), 10) || 0;
      let delaiTexte;
      
      if (delai <= 0) delaiTexte = "À quai";
      else if (delai < 60) delaiTexte = delai + " min";
      else { 
        const h = Math.floor(delai/60), m = delai%60; 
        delaiTexte = h+"h"+(m > 0 ? String(m).padStart(2,"0") : ""); 
      }
      
      if (!poles[nomPole]) poles[nomPole] = [];
      poles[nomPole].push({ ligne, direction, delai, delaiTexte });
    }
    
    for (const nom of Object.keys(poles)) {
      poles[nom].sort((a,b) => a.delai - b.delai);
    }
    
    let alertes = [];
    try {
      const resA = await fetch(
        "https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_systral.tclalertetrafic_2/all.json?maxfeatures=20&start=1",
        { headers: { "Authorization": auth, "Accept": "application/json" } }
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
    
    return new Response(JSON.stringify({
      poles,
      alertes,
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