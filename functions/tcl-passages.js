// Cloudflare Pages Function — /functions/tcl-passages.js
// CORRECTION 26/06/2026 : IDs corriges, terminus A/T1/T2 forces
// CORRECTION 26/06/2026 : un seul a quai par pole pour T1/T2 (quai partage)
// CORRECTION 26/06/2026 : normalisation accents direction

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

// Poles ou T1 et T2 partagent le meme quai physique
// -> un seul "a quai" autorise pour le groupe T1/T2 ensemble
const POLES_QUAI_PARTAGE_T1T2 = new Set([
  "Sainte-Blandine",
  "Place des Archives",
  "Musee des Confluences",
  "Hotel Region Montrochet",
  "Montrochet",
  "Claudius Collonge",
]);

const SENS_PAR_ID = {
  30101:"A", 30459:"R",
  42745:"R", 46049:"A",
  32103:"A", 32102:"R",
  34834:"A", 34835:"R",
  34836:"A", 34837:"R",
  34874:"R", 34875:"A",
  32138:"A",
  46159:"A", 46160:"R",
  46154:"R", 35094:"A",
};

const TERMINUS = {
  "A":  {"A":"Vaulx-en-Velin La Soie","R":"Perrache"},
  "T1": {"A":"IUT Feyssine",           "R":"Debourg"},
  "T2": {"A":"Saint-Priest Bel Air",   "R":"Hotel Region Montrochet"},
};

// Normalisation des directions : retire accents pour comparaison,
// mais conserve la forme lisible pour l'affichage
const DIRECTION_AFFICHAGE = {
  "HOTEL REGION MONTROCHET": "Hôtel Région Montrochet",
  "IUT FEYSSINE":            "IUT Feyssine",
  "DEBOURG":                 "Debourg",
  "SAINT-PRIEST BEL AIR":   "Saint-Priest Bel Air",
  "VAULX-EN-VELIN LA SOIE": "Vaulx-en-Velin La Soie",
  "PERRACHE":                "Perrache",
};

function terminerDirection(ligne, idArret) {
  const t = TERMINUS[ligne];
  if (!t) return null;
  const sens = SENS_PAR_ID[idArret];
  if (!sens) return null;
  return t[sens];
}

function normaliserDirection(d) {
  return String(d||"").trim().toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/\s+/g," ").replace(/[.,;:'"\-]/g,"");
}

function normaliserLigne(l) { return String(l||"").trim().toUpperCase(); }

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
    const apiHeaders = {"Authorization":auth,"Accept":"application/json"};

    const resP = await fetch(
      "https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_sytral.tclpassagearret/all.json?maxfeatures=9300&start=1&srsname=WGS84",
      {headers:apiHeaders}
    );
    if (resP.status===401) throw new Error("Authentification refusee (401)");
    if (!resP.ok) throw new Error("HTTP "+resP.status);

    const bodyP = await resP.json();
    const values = bodyP.values||[];

    if (values.length===0) return new Response(
      JSON.stringify({poles:{},alertes:[],maj:new Date().toISOString(),vide:true}),
      {status:200,headers:CORS}
    );

    const allPassages=[];
    for (const v of values) {
      const idDep=v.id;
      if (!ALL_IDS.has(idDep)) continue;
      const nomPole=Object.entries(ARRETS).find(([,ids])=>ids.includes(idDep))?.[0];
      if (!nomPole) continue;
      const ligne=normaliserLigne(v.ligne);
      if (!ligne) continue;
      const lignesAttendues=LIGNES_VALIDES[nomPole];
      if (lignesAttendues&&lignesAttendues.length>0&&!lignesAttendues.includes(ligne)) continue;

      // Terminus force pour A, T1, T2
      let directionBrute=String(v.direction||"").trim();
      const terminus=terminerDirection(ligne,idDep);
      if (terminus) directionBrute=terminus;

      // Forme lisible avec accents
      const dirNorm=normaliserDirection(directionBrute);
      const dirAffichage=DIRECTION_AFFICHAGE[dirNorm]||directionBrute;

      const delaiStr=String(v.delaipassage||"0");
      let delai,delaiTexte;
      if (delaiStr==="Proche"||delaiStr==="proche"){delai=0;delaiTexte="A quai";}
      else {
        delai=parseInt(delaiStr,10)||0;
        if (delai<=0) delaiTexte="A quai";
        else if (delai<60) delaiTexte=delai+" min";
        else {const h=Math.floor(delai/60),m=delai%60;delaiTexte=h+"h"+(m>0?String(m).padStart(2,"0"):"");}
      }
      allPassages.push({nomPole,ligne,direction:dirNorm,directionBrute:dirAffichage,delai,delaiTexte});
    }

    allPassages.sort((a,b)=>a.delai-b.delai);

    const poles={};
    const vusStrict=new Set();
    const vusAQuaiParLigne=new Set();
    const vusAQuaiT1T2=new Set(); // un seul a quai T1/T2 par pole a quai partage

    for (const p of allPassages) {
      const cleStricte=p.nomPole+"|"+p.ligne+"|"+p.direction;
      if (vusStrict.has(cleStricte)) continue;

      if (p.delai<=0) {
        // Regle standard : un seul a quai par pole+ligne
        const cleAQuai=p.nomPole+"|"+p.ligne;
        if (vusAQuaiParLigne.has(cleAQuai)) continue;

        // Regle supplementaire : sur quais partages T1/T2,
        // un seul a quai pour l'ensemble du groupe T1/T2
        if ((p.ligne==="T1"||p.ligne==="T2") && POLES_QUAI_PARTAGE_T1T2.has(p.nomPole)) {
          const cleT1T2=p.nomPole+"|T1T2";
          if (vusAQuaiT1T2.has(cleT1T2)) continue;
          vusAQuaiT1T2.add(cleT1T2);
        }

        vusAQuaiParLigne.add(cleAQuai);
      }

      vusStrict.add(cleStricte);
      if (!poles[p.nomPole]) poles[p.nomPole]=[];
      poles[p.nomPole].push({ligne:p.ligne,direction:p.directionBrute,delai:p.delai,delaiTexte:p.delaiTexte});
    }

    for (const nom of Object.keys(poles)) poles[nom].sort((a,b)=>a.delai-b.delai);

    let alertes=[];
    try {
      const resA=await fetch(
        "https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_sytral.tclalertetrafic_2/all.json?maxfeatures=20&start=1&srsname=WGS84",
        {headers:apiHeaders}
      );
      if (resA.ok){
        const bodyA=await resA.json();
        if(bodyA.values?.length){
          alertes=bodyA.values.map(a=>({
            titre:a.titre||"",message:a.message||"",type:a.type||"Information",
            lignes:a.lignes?String(a.lignes).split(",").map(l=>l.trim()):[],
          }));
        }
      }
    } catch(_){}

    return new Response(
      JSON.stringify({poles,alertes,maj:new Date().toISOString()}),
      {status:200,headers:CORS}
    );

  } catch(e) {
    return new Response(
      JSON.stringify({error:e.message,poles:{},alertes:[],maj:new Date().toISOString()}),
      {status:200,headers:CORS}
    );
  }
}
