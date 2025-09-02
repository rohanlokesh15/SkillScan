// frontend/index.js
(() => {
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  // Backend base URL (can be set in Settings modal and saved to localStorage)
  let API_BASE = localStorage.getItem("API_BASE") || "http://localhost:5000";

  const drop = $("#drop");
  const resumeInput = $("#resume-files");
  const jdInput = $("#jd-file");
  const jdText = $("#jd-text");
  const jdName = $("#jd-file-name");
  const list = $("#file-list");
  const analyzeBtn = $("#analyze");
  const clearBtn = $("#clear");
  const statusEl = $("#status");
  const resultsSec = $("#results");
  const cards = $("#cards");
  const minScore = $("#min-score");
  const exportBtn = $("#export");

  const modal = $("#modal");
  const modalBody = $("#modal-body");
  const closeModal = $(".close", modal);

  const settings = $("#settings");
  const openSettings = $("#open-settings");
  const closeSettings = $(".close-settings", settings);
  const apiInput = $("#api-base");
  const saveApi = $("#save-api");
  const testApi = $("#test-api");
  const apiMsg = $("#api-msg");

  let resumes = [];
  let lastResults = [];

  // Settings modal
  openSettings.addEventListener("click", () => {
    apiInput.value = API_BASE;
    settings.hidden = false;
  });
  closeSettings.addEventListener("click", () => settings.hidden = true);
  saveApi.addEventListener("click", () => {
    API_BASE = apiInput.value.trim() || API_BASE;
    localStorage.setItem("API_BASE", API_BASE);
    apiMsg.textContent = "Saved. Current backend: " + API_BASE;
  });
  testApi.addEventListener("click", async () => {
    apiMsg.textContent = "Testing...";
    try {
      const r = await fetch(API_BASE.replace(/\/$/,"") + "/health");
      const j = await r.json();
      apiMsg.textContent = j.ok ? "✅ Backend reachable" : "⚠️ Response received but not OK";
    } catch (e) {
      apiMsg.textContent = "❌ Could not reach backend";
    }
  });

  // Drag & drop
  ["dragenter","dragover"].forEach(evt => drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.add("drag"); }));
  ["dragleave","drop"].forEach(evt => drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.remove("drag"); }));
  drop.addEventListener("drop", e => addFiles(e.dataTransfer.files));
  resumeInput.addEventListener("change", e => addFiles(e.target.files));

  function addFiles(files) {
    const arr = Array.from(files).filter(f => /\.(pdf|docx?|PDF|DOCX?)$/.test(f.name));
    for (const f of arr) {
      if (resumes.find(x => x.name === f.name)) continue;
      resumes.push(f);
    }
    renderFiles();
  }

  function renderFiles() {
    list.innerHTML = "";
    resumes.forEach(f => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${f.name}</span><span class="badge">${(f.size/1024).toFixed(1)} KB</span>
        <button class="button small outline remove">Remove</button>`;
      $(".remove", li).addEventListener("click", () => {
        resumes = resumes.filter(x => x !== f);
        renderFiles();
      });
      list.appendChild(li);
    });
    statusEl.textContent = resumes.length ? `${resumes.length} file(s) ready` : "No files selected";
  }

  jdInput.addEventListener("change", () => {
    jdName.textContent = jdInput.files[0] ? jdInput.files[0].name : "";
  });

  clearBtn.addEventListener("click", () => {
    resumes = [];
    renderFiles();
    resultsSec.hidden = true;
    cards.innerHTML = "";
    lastResults = [];
  });

  analyzeBtn.addEventListener("click", async () => {
    if (!resumes.length) { statusEl.textContent = "Please add at least one resume."; return; }
    statusEl.textContent = "Uploading & analyzing...";
    const fd = new FormData();
    resumes.forEach(f => fd.append("files[]", f));
    const jdt = jdText.value.trim();
    if (jdt) fd.append("jd_text", jdt);
    if (jdInput.files[0]) fd.append("jd_file", jdInput.files[0]);
    try {
      const r = await fetch(API_BASE.replace(/\/$/,"") + "/upload", { method:"POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Upload failed");
      lastResults = data.results || [];
      renderResults(lastResults);
      statusEl.textContent = `Analyzed ${data.total_resumes} resume(s).`;
    } catch (e) {
      statusEl.textContent = "Error: " + (e.message || "Failed to analyze");
    }
  });

  function renderResults(results) {
    resultsSec.hidden = false;
    cards.innerHTML = "";
    results.forEach(res => {
      const allSkills = Object.values(res.skills || {}).flat();
      const topSkills = allSkills.slice(0,6);
      const card = document.createElement("div");
      card.className = "card-res";
      card.innerHTML = `
        <div class="score">
          <div class="circle" style="--p:${res.matchScore||0}"><span>${res.matchScore||0}%</span></div>
          <div>
            <h4>${res.filename}</h4>
            <div class="muted">${res.strength_level || ""} · Rank #${res.rank||"-"} · ${res.comparison||""}</div>
          </div>
        </div>
        <div class="tags">${topSkills.map(s=>`<span class="tag">${s}</span>`).join("")}</div>
        <div class="muted" style="margin-top:.5rem">${(res.keyHighlights||[]).slice(0,2).join(" · ")}</div>
        <div class="row" style="margin-top:.75rem">
          <button class="button outline details"><i class="fas fa-chart-line"></i> Details</button>
        </div>
      `;
      $(".details", card).addEventListener("click", () => openDetails(res));
      cards.appendChild(card);
    });
    filterByScore();
  }

  function filterByScore(){
    const min = Number(minScore.value);
    $$(".card-res", cards).forEach((el, i) => {
      const res = lastResults[i];
      el.style.display = (res.matchScore >= min) ? "" : "none";
    });
  }
  minScore.addEventListener("input", filterByScore);

  function openDetails(res){
    modalBody.innerHTML = `
      <h3>${res.filename}</h3>
      <div class="row"><strong>${res.matchScore}%</strong> · ${res.strength_level} · Rank #${res.rank}</div>
      <canvas id="radar" style="margin:1rem 0;max-height:360px"></canvas>
      <h4>Contact</h4>
      <p class="muted">${res.contact_info?.email || "—"} · ${res.contact_info?.phone || "—"} · ${res.contact_info?.linkedin || "—"}</p>
      <h4>Education</h4>
      <ul class="bullets">${(res.education||[]).map(e=>`<li>${e.degree}${e.year?` (${e.year})`:""}</li>`).join("") || "<li>—</li>"}</ul>
      <h4>Experience</h4>
      <p class="muted">Total years: ${res.experience?.total_years || 0}</p>
      <h4>Skills</h4>
      <div class="tags">${Object.entries(res.skills||{}).map(([c,arr])=>arr.map(s=>`<span class="tag">${s}</span>`).join("")).join("")}</div>
      <h4>Projects</h4>
      <ul class="bullets">${(res.projects||[]).map(p=>`<li>${p.description}</li>`).join("") || "<li>—</li>"}</ul>
      <h4>Certifications</h4>
      <ul class="bullets">${(res.certifications||[]).map(c=>`<li>${c.name}${c.year?` (${c.year})`:""}</li>`).join("") || "<li>—</li>"}</ul>
      <h4>Highlights</h4>
      <ul class="bullets">${(res.keyHighlights||[]).map(h=>`<li>${h}</li>`).join("") || "<li>—</li>"}</ul>
      <h4>Recommendations</h4>
      <ul class="bullets">${(res.recommendations||[]).map(h=>`<li>${h}</li>`).join("") || "<li>—</li>"}</ul>
    `;
    modal.hidden = false;
    // Radar chart
    setTimeout(()=>{
      const ctx = document.getElementById("radar").getContext("2d");
      const scores = {
        "Overall Match": res.matchScore || 0,
        "Technical Skills": Math.min(Object.values(res.skills||{}).flat().length*10, 100),
        "Experience": Math.min((res.experience?.total_years||0)*20, 100),
        "Projects": Math.min((res.projects?.length||0)*25, 100),
        "Education": Math.min((res.education?.length||0)*25, 100),
      };
      new Chart(ctx, {
        type: "radar",
        data: { labels: Object.keys(scores), datasets: [{ label: "Profile", data: Object.values(scores) }] },
        options: { responsive:true, scales:{ r:{ beginAtZero:true, max:100 } } }
      });
    }, 50);
  }

  closeModal.addEventListener("click", ()=> modal.hidden = true);
  modal.addEventListener("click", e => { if(e.target===modal) modal.hidden = true; });

  exportBtn.addEventListener("click", () => {
    if (!lastResults.length) return;
    const headers = ["filename","matchScore","rank","strength_level"];
    const rows = lastResults.map(r => [r.filename, r.matchScore, r.rank, r.strength_level].join(","));
    const csv = "data:text/csv;charset=utf-8," + ["filename,matchScore,rank,strength_level", ...rows].join("\n");
    const a = document.createElement("a");
    a.href = encodeURI(csv);
    a.download = "results.csv";
    a.click();
  });
})();
