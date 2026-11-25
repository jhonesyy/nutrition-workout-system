/**
 * Navigation Shell Injector for Member Portal
 * Dynamically injects the sidebar into the .app container.
 */

function bootShell(activePage = '') {
  // 1. Auth Guard: Redirect to login if no token
  if (!getToken() || !getUser()) {
    window.location.href = 'index.html';
    return;
  }

  const app = document.getElementById('app');
  if (!app) return;

  const user = getUser();
  const userName = user ? (user.full_name || user.email) : 'Member';
  
  // Update user chip in the topbar
  const userChip = document.getElementById('userChip');
  if (userChip) {
    userChip.textContent = userName;
  }

  // 2. Define the sidebar HTML
  const sidebarHTML = `
    <aside class="sidebar">
      <div class="brand">NutriFit<span>Member Portal</span></div>
      <a href="dashboard.html" class="${activePage === 'dashboard.html' ? 'active' : ''}">Dashboard</a>
      <a href="nutrition.html" class="${activePage === 'nutrition.html' ? 'active' : ''}">Nutrition</a>
      <a href="activity.html" class="${activePage === 'activity.html' ? 'active' : ''}">Activity</a>
      <a href="health.html" class="${activePage === 'health.html' ? 'active' : ''}">Health Sync</a>
      <a href="loyalty.html" class="${activePage === 'loyalty.html' ? 'active' : ''}">Loyalty</a>
      <a href="profile.html" class="${activePage === 'profile.html' ? 'active' : ''}">Profile</a>
      <a href="settings.html" class="${activePage === 'settings.html' ? 'active' : ''}">Settings</a>
      <a href="index.html" class="logout" id="navLogoutBtn">Logout</a>
    </aside>
  `;

  // 3. Inject sidebar as the FIRST child of .app
  // This ensures the CSS grid (240px sidebar + 1fr main) works perfectly
  app.insertAdjacentHTML('afterbegin', sidebarHTML);

  // 4. Attach logout listener
  const logoutBtn = document.getElementById('navLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      clearSession();
      window.location.href = 'index.html';
    });
  }
}