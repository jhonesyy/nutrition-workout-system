function renderNav(active) {
  const items = [
    ['dashboard.html', 'Dashboard'],
    ['profile.html', 'My Profile'],
    ['health.html', 'Health Sync'],
    ['nutrition.html', 'Nutrition'],
    ['workouts.html', 'Workouts'],
    ['activity.html', 'Activity Log'],
    ['loyalty.html', 'Loyalty'],
    ['settings.html', 'Settings']
  ];
  const links = items.map(([href, label]) =>
    `<a href="${href}" class="${active === href ? 'active' : ''}">${label}</a>`
  ).join('');
  return `
    <aside class="sidebar">
      <div class="brand">NutriFit<span>Member</span></div>
      ${links}
      <a href="#" class="logout" id="logoutBtn">Logout</a>
    </aside>`;
}

function bootShell(active) {
  if (!requireUser()) return;
  const root = document.getElementById('app');
  root.insertAdjacentHTML('afterbegin', renderNav(active));
  document.getElementById('logoutBtn').onclick = (e) => {
    e.preventDefault();
    logout();
  };
  const user = getUser();
  const el = document.getElementById('userChip');
  if (el) el.textContent = user.full_name || user.email;
}