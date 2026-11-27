/**
 * Navigation Shell Injector for Member Portal
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
  if (userChip) userChip.textContent = userName;

  const sidebarHTML = `
    <aside class="sidebar">
      <div class="brand">NutriFit<span>Member Portal</span></div>
      <a href="dashboard.html" class="${activePage === 'dashboard.html' ? 'active' : ''}">Dashboard</a>
      <a href="nutrition.html" class="${activePage === 'nutrition.html' ? 'active' : ''}">Nutrition</a>
      <a href="activity.html" class="${activePage === 'activity.html' ? 'active' : ''}">Activity</a>
      <a href="mobility.html" class="${activePage === 'mobility.html' ? 'active' : ''}">Mobility Test</a>
      <a href="workout-assessment.html" class="${activePage === 'workout-assessment.html' ? 'active' : ''}">Workout Assessment</a>
      <a href="ai-chat.html" class="${activePage === 'ai-chat.html' ? 'active' : ''}">AI Assistant</a>
      <a href="health.html" class="${activePage === 'health.html' ? 'active' : ''}">Health Sync</a>
      <a href="loyalty.html" class="${activePage === 'loyalty.html' ? 'active' : ''}">Loyalty</a>
      <a href="profile.html" class="${activePage === 'profile.html' ? 'active' : ''}">Profile</a>
      <a href="settings.html" class="${activePage === 'settings.html' ? 'active' : ''}">Settings</a>
      <a href="index.html" class="logout" id="navLogoutBtn">Logout</a>
    </aside>
  `;

  app.insertAdjacentHTML('afterbegin', sidebarHTML);

  const messengerHTML = `
    <a
      href="https://m.me/ian.gabriel.lorenzo.2024"
      target="_blank"
      rel="noopener noreferrer"
      id="coachIanMessengerBtn"
      aria-label="Chat with Coach Ian on Messenger"
      style="
        position: fixed;
        right: 24px;
        bottom: 24px;
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 20px;
        border-radius: 30px;
        background: #0084ff;
        color: white;
        text-decoration: none;
        font-weight: 700;
        box-shadow: 0 4px 14px rgba(0,0,0,.25);
      "
    >
      <span style="font-size: 22px;">●</span>
      <span>Chat with Coach Ian</span>
    </a>
  `;

  if (!document.getElementById('coachIanMessengerBtn')) {
    document.body.insertAdjacentHTML('beforeend', messengerHTML);
  }

  const logoutBtn = document.getElementById('navLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (event) => {
      event.preventDefault();
      clearSession();
      window.location.href = 'index.html';
    });
  }
}



async function getOnboardingNextStep() {
  const profile = await apiGet('/users/profile');

  const profileComplete =
    profile &&
    profile.age !== null &&
    profile.age !== undefined &&
    profile.sex &&
    profile.height_cm !== null &&
    profile.height_cm !== undefined &&
    profile.weight_kg !== null &&
    profile.weight_kg !== undefined &&
    profile.activity_factor !== null &&
    profile.activity_factor !== undefined;

  if (!profileComplete) {
    return 'profile.html';
  }

  const assessment = await apiGet('/workouts/assessment');

  if (!assessment.mobilityCompleted) {
    return 'mobility.html';
  }

  if (!assessment.completed) {
    return 'workout-assessment.html';
  }

  return null;
}

