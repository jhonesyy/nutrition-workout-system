/**
 * Navigation Shell Injector for Member Portal
 * Dynamically injects the sidebar into the .app container.
 */

function bootShell(activePage = '') {
  if (!getToken() || !getUser()) {
    window.location.href = 'index.html';
    return;
  }

  const app = document.getElementById('app');
  if (!app) return;

  const user = getUser();
  const userName = user ? (user.full_name || user.email) : 'Member';

  const userChip = document.getElementById('userChip');
  if (userChip) {
    userChip.textContent = userName;
  }

  const sidebarHTML = `
    <aside class="sidebar">
      <div class="brand">NutriFit<span>Member Portal</span></div>
      <a href="dashboard.html" class="${activePage === 'dashboard.html' ? 'active' : ''}">Dashboard</a>
      <a href="nutrition.html" class="${activePage === 'nutrition.html' ? 'active' : ''}">Nutrition</a>
      <a href="activity.html" class="${activePage === 'activity.html' ? 'active' : ''}">Activity</a>
      <a href="ai-chat.html" class="${activePage === 'ai-chat.html' ? 'active' : ''}">AI Assistant</a>
      <a href="health.html" class="${activePage === 'health.html' ? 'active' : ''}">Health Sync</a>
      <a href="loyalty.html" class="${activePage === 'loyalty.html' ? 'active' : ''}">Loyalty</a>
      <a href="profile.html" class="${activePage === 'profile.html' ? 'active' : ''}">Profile</a>
      <a href="settings.html" class="${activePage === 'settings.html' ? 'active' : ''}">Settings</a>
      <a href="index.html" class="logout" id="navLogoutBtn">Logout</a>
    </aside>
  `;

  app.insertAdjacentHTML('afterbegin', sidebarHTML);

  const logoutBtn = document.getElementById('navLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      clearSession();
      window.location.href = 'index.html';
    });
  }
}