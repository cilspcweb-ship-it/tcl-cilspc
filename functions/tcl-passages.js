// Cloudflare Pages Function
const ARRETS = {
  "Perrache": [33765,33767,33779,30459,32103,32102],
  "Confluence": [17397,46179],
  "Sainte-Blandine": [32138,46159,46160,34836,34837],
  "Hotel Region Montrochet": [43835,43836,43838,45378,34874,34875,50432],
  "Musee des Confluences": [2541,2542,2543,2545,46154,35094],
  "Montrochet": [39134,39135],
  "Ampere - Victor Hugo": [10698,42745],
  "Charlemagne - C. Perier": [11898,30057],
  "Place des Archives": [2933,2934,35580,34834,34835],
  "Claudius Collonge": [46975,542],
};

const LIGNES_VALIDES = {
  "Perrache": ["A","B","T1","T2","C20","C7","C9","18","63","91"],
  "Confluence": ["T1","C20","C9"],
  "Sainte-Blandine": ["T1","T2"],
  "Hotel Region Montrochet": ["T1","T2"],
  "Musee des Confluences": ["T1","C20"],
  "Montrochet": ["T2"],
  "Ampere - Victor Hugo": ["A","18","63"],
  "Charlemagne - C. Perier": ["18","63"],
  "Place des Archives": ["A","18"],
  "Claudius Collonge": ["T1","T2"],
};

const ALL_IDS = new Set(Object.values(ARRETS).flat());

export async function onRequest(context) {
  try {
    // ✅ Vérifie les secrets Cloudflare
    const user = context.env.GRANDLYON_USER;
    const pass = context.env.GRANDLYON_PASS;
    
    if (!user || !pass) {
      return new Response(JSON.stringify({ 
        error: "Secrets Cloudflare non configurés",
        message: "Ajoute GRANDLYON_USER et GRANDLYON_PASS dans Settings > Variables and secrets"
      }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    const auth = "Basic " + btoa(`${user}:${pass}`);
    
    const res = await fetch(
      "https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_systral.tclpassagearret/all.json?maxfeatures=9300&start=1",
      { 
        headers: { 
          "Authorization": auth, 
          "Accept": "application/json" 
        } 
      }
    );
    
    if (res.status === 401) {
      return new Response(JSON.stringify({ 
        error: "Authentification échouée",
        message: "Vérifie tes identifiants GrandLyon dans les secrets Cloudflare"
      }), { 
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    if (!res.ok) {
      throw new Error("HTTP " + res.status);
    }
    
    const data = await res.json();
    const values = data.values || [];
    
    const poles = {};
    
    for (const v of values) {
      const idDep = v.id;
      const idArr = v.idtarretdestination;
      
      let nomPole = null;
      
      if (ALL_IDS.has(idDep)) {
        nomPole = Object.entries(ARRETS).find(([, ids]) => ids.includes(idDep))?.[0];
      } else if (idArr && ALL_IDS.has(idArr)) {
        nomPole = Object.entries(ARRETS).find(([, ids]) => ids.includes(idArr))?.[0];
      }
      
      if (!nomPole) continue;
      
      const ligne = String(v.ligne || "").trim().toUpperCase();
      if (!ligne) continue;
      
      const lignesAttendues = LIGNES_VALIDES[nomPole];
      if (lignesAttendues && !lignesAttendues.includes(ligne)) continue;
      
      const direction = String(v.direction || "").trim();
      const delaiStr = String(v.delaipassage || "0");
      
      let delai, delaiTexte;
      if (delaiStr === "Proche" || delaiStr === "proche") {
        delai = 0;
        delaiTexte = "À quai";
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
      poles[nomPole].push({
        ligne,
        direction,
        delai,
        delaiTexte
      });
    }
    
    // Trie et dédoublonne
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
      maj: new Date().toISOString()
    }), {
      status: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
    
  } catch (e) {
    return new Response(JSON.stringify({
      error: e.message,
      poles: {},
      alertes: [],
      maj: new Date().toISOString()
    }), {
      status: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}