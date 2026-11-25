<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Nutrition | NutriFit</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div class="app" id="app">
    <main class="main">
      <div class="topbar">
        <h1>Nutrition &amp; Meal Plans</h1>
        <div id="userChip" class="muted"></div>
      </div>

      <!-- 1. TODAY SUMMARY -->
      <div class="card">
        <h2>Today summary</h2>
        <p id="summaryBox" class="muted">Loading…</p>
        <div class="progress"><span id="calBar" style="width:0%"></span></div>
      </div>

      <!-- 2. AI MEAL PLAN GENERATOR (NEW) -->
      <div class="card">
        <h2>Generate AI Meal Plan</h2>
        <p class="muted">Get a personalized full-day meal plan based on your profile, goals, and allergens.</p>
        <button class="btn" type="button" id="btnGenerateMealPlan">Generate Meal Plan</button>
        <div id="mealPlanResult" style="margin-top:12px"></div>
      </div>

      <!-- 3. RECOMMENDED FOODS -->
      <div class="card">
        <h2>Recommended foods</h2>
        <p class="muted">Based on your profile / goals (allergen-aware when backend filters).</p>
        <button class="btn secondary" type="button" id="btnRecommend">Refresh recommendations</button>
        <div id="recommendList" style="margin-top:12px"></div>
      </div>

      <!-- 4. LOG A MEAL -->
      <div class="card">
        <h2>Log a meal</h2>
        <form id="logForm">
          <label>Food ID (from recommendations or catalog)</label>
          <input type="number" id="food_id" required min="1" />
          <div class="form-row">
            <div>
              <label>Meal type</label>
              <select id="meal_type">
                <option value="breakfast">Breakfast</option>
                <option value="morning_snack">Morning snack</option>
                <option value="lunch">Lunch</option>
                <option value="afternoon_snack">Afternoon snack</option>
                <option value="dinner">Dinner</option>
              </select>
            </div>
            <div>
              <label>Servings</label>
              <input type="number" id="servings" value="1" min="0.1" step="0.1" />
            </div>
          </div>
          <button class="btn" type="submit">Log meal</button>
          <p class="msg" id="logMsg"></p>
        </form>
      </div>

      <!-- 5. TODAY'S MEAL LOGS -->
      <div class="card">
        <h2>Today’s meal logs</h2>
        <table>
          <thead>
            <tr><th>Meal</th><th>Food</th><th>kcal</th><th></th></tr>
          </thead>
          <tbody id="mealsBody"><tr><td colspan="4">Loading…</td></tr></tbody>
        </table>
      </div>
    </main>
  </div>

  <script src="api.js"></script>
  <script src="nav.js"></script>
  <script>
    bootShell('nutrition.html');

    // ---------- SUMMARY ----------
    async function loadSummary() {
      try {
        const s = await apiGet('/meals/summary') || {};
        const c = s.consumed || {};
        const t = s.targets  || {};

        const cal = c.calories ?? 0;
        const p   = c.protein_g ?? 0;
        const cb  = c.carbs_g ?? 0;
        const f   = c.fat_g ?? 0;

        document.getElementById('summaryBox').textContent =
          `${Math.round(cal)} kcal · P ${Math.round(p)}g · C ${Math.round(cb)}g · F ${Math.round(f)}g` +
          (t.calories ? `  (target ${Math.round(t.calories)} kcal)` : '');

        const target = Number(t.calories) || 2000;
        const pct = Math.min(100, Math.round((Number(cal) / target) * 100));
        document.getElementById('calBar').style.width = pct + '%';
      } catch (e) {
        console.error('Summary error:', e);
        document.getElementById('summaryBox').textContent = e.message || 'Could not load summary';
      }
    }

    // ---------- TODAY'S MEALS ----------
    async function loadMeals() {
      try {
        const data = await apiGet('/meals') || {};
        const rows = Array.isArray(data) ? data : (data.meals || data.logs || []);
        const body = document.getElementById('mealsBody');

        if (!rows.length) {
          body.innerHTML = '<tr><td colspan="4">No meals logged today</td></tr>';
          return;
        }

        body.innerHTML = rows.map(m => `
          <tr>
            <td>${m.meal_type || m.meal || '—'}</td>
            <td>${m.food_name || m.name || ('#' + (m.food_id || ''))}</td>
            <td>${m.calories ?? m.total_calories ?? '—'}</td>
            <td><button class="btn secondary" data-id="${m.id}" type="button">Delete</button></td>
          </tr>`).join('');

        body.querySelectorAll('button[data-id]').forEach(btn => {
          btn.onclick = async () => {
            if (!confirm('Remove this meal log?')) return;
            try {
              await apiDelete('/meals/' + btn.dataset.id);
              loadMeals();
              loadSummary();
            } catch (err) { alert(err.message); }
          };
        });
      } catch (e) {
        console.error('Meals load error:', e);
        document.getElementById('mealsBody').innerHTML = `<tr><td colspan="4">${e.message}</td></tr>`;
      }
    }

    // ---------- RECOMMENDATIONS ----------
    async function loadRecommend() {
      const box = document.getElementById('recommendList');
      box.innerHTML = '<p class="muted">Loading…</p>';
      try {
        const data = await apiGet('/meals/recommend') || {};
        const groups = Array.isArray(data.recommendations) ? data.recommendations : [];
        const rem = data.remaining_macros || {};

        if (!groups.length) {
          box.innerHTML = '<p class="muted">No recommendations yet. Complete your profile first.</p>';
          return;
        }

        let html = `
          <p class="muted" style="margin-bottom:10px">
            Remaining today —
            <strong>${Math.round(rem.calories ?? 0)}</strong> kcal ·
            P ${Math.round(rem.protein_g ?? 0)}g ·
            C ${Math.round(rem.carbs_g ?? 0)}g ·
            F ${Math.round(rem.fat_g ?? 0)}g
          </p>`;

        groups.forEach(group => {
          const foods = Array.isArray(group.foods) ? group.foods : [];
          html += `
            <div style="margin:14px 0 6px">
              <strong style="text-transform:capitalize">${group.meal_type}</strong>
              <span class="muted"> — ${group.reason || ''}</span>
            </div>`;

          if (!foods.length) {
            html += '<p class="muted" style="margin:4px 0 8px">No matching foods.</p>';
            return;
          }

          html += foods.map(f => `
            <div style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px">
              <strong>${f.name || 'Unknown'}</strong>
              <span class="muted"> · id ${f.id ?? '—'}</span>
              ${f.brand ? `<div class="muted">${f.brand}${f.serving_size ? ' · ' + f.serving_size : ''}</div>` : ''}
              <div class="muted">
                ${f.calories ?? '—'} kcal · P ${f.protein_g ?? '—'}g · C ${f.carbs_g ?? '—'}g · F ${f.fat_g ?? '—'}g
              </div>
              <button class="btn secondary" type="button" data-fid="${f.id}">Use this food id</button>
            </div>`).join('');
        });

        box.innerHTML = html;

        box.querySelectorAll('button[data-fid]').forEach(b => {
          b.onclick = () => { document.getElementById('food_id').value = b.dataset.fid; };
        });
      } catch (e) {
        console.error('Recommend error:', e);
        box.innerHTML = `<p class="msg err">${e.message}</p>`;
      }
    }

    document.getElementById('btnRecommend').onclick = loadRecommend;

    // ---------- LOG MEAL ----------
    document.getElementById('logForm').onsubmit = async (e) => {
      e.preventDefault();
      const msg = document.getElementById('logMsg');
      msg.className = 'msg';
      msg.textContent = 'Logging...';

      try {
        await apiPost('/meals', {
          food_id: Number(document.getElementById('food_id').value),
          meal_type: document.getElementById('meal_type').value,
          quantity: Number(document.getElementById('servings').value) || 1
        });
        msg.className = 'msg ok';
        msg.textContent = 'Meal logged successfully!';
        document.getElementById('logForm').reset();
        document.getElementById('servings').value = 1;
        loadMeals();
        loadSummary();
        loadRecommend();
      } catch (err) {
        msg.className = 'msg err';
        msg.textContent = err.message;
      }
    };

    // ---------- AI MEAL PLAN GENERATION ----------
    async function generateAIPlan() {
      const box = document.getElementById('mealPlanResult');
      box.innerHTML = '<p class="muted">Generating your personalized meal plan... (this may take a few seconds)</p>';
      try {
        const res = await apiPost('/ai/meal-plan', {});
        if (!res.success) throw new Error(res.message || 'Failed to generate plan');
        
        const plan = res.data;
        const summary = plan.dailySummary || {};
        
        let html = `
          <div style="background:#121820;padding:16px;border-radius:8px;border:1px solid var(--border);margin-bottom:16px">
            <h3 style="margin-top:0">Daily Summary</h3>
            <p class="muted">Target: ${summary.targetCalories || '—'} kcal · P: ${summary.protein_g || '—'}g · C: ${summary.carbs_g || '—'}g · F: ${summary.fat_g || '—'}g</p>
            <p class="muted">Actual: ${summary.actualCalories || '—'} kcal · P: ${summary.protein_g || '—'}g · C: ${summary.carbs_g || '—'}g · F: ${summary.fat_g || '—'}g</p>
          </div>
        `;
        
        if (Array.isArray(plan.meals)) {
          plan.meals.forEach(meal => {
            html += `
              <div style="margin-bottom:16px">
                <h4 style="margin:0 0 8px">${meal.name || 'Meal'} <span class="muted">(${meal.calories || 0} kcal)</span></h4>
                <ul style="margin:0;padding-left:20px;color:var(--text)">
                  ${(meal.foodItems || []).map(item => `<li>${item.name} — ${item.portion_g}g (P:${item.protein_g}g, C:${item.carbs_g}g, F:${item.fat_g}g)</li>`).join('')}
                </ul>
                ${meal.notes ? `<p class="muted" style="margin:8px 0 0;font-style:italic">${meal.notes}</p>` : ''}
              </div>
            `;
          });
        }
        
        if (Array.isArray(plan.tips) && plan.tips.length > 0) {
          html += `
            <div style="margin-top:16px;padding:12px;background:#1e2836;border-radius:8px">
              <h4 style="margin:0 0 8px">Nutrition Tips</h4>
              <ul style="margin:0;padding-left:20px;color:var(--muted)">
                ${plan.tips.map(tip => `<li>${tip}</li>`).join('')}
              </ul>
            </div>
          `;
        }
        
        box.innerHTML = html;
      } catch (err) {
        console.error('Meal plan generation error:', err);
        box.innerHTML = `<p class="msg err">${err.message}</p>`;
      }
    }

    // Attach the click event (NOW SAFE because the button exists in HTML)
    document.getElementById('btnGenerateMealPlan').onclick = generateAIPlan;
    
    // Initial loads
    loadSummary();
    loadMeals();
    loadRecommend();
  </script>
</body>
</html>