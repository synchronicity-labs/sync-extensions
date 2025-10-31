// Tab switching
document.querySelectorAll('.tab-switch').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    
    // Use showTab function to handle tab switching properly
    if (typeof window.showTab === 'function') {
      window.showTab(tab);
    } else {
      // Fallback to manual switching
      document.querySelectorAll('.tab-switch').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      document.getElementById(tab).classList.add('active');
    }
  });
});

// Profile dropdown
const profileBtn = document.querySelector('.profile-btn');
const dropdown = document.querySelector('.profile-dropdown');

profileBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  dropdown.classList.toggle('show');
});

// Dropdown items with tab attribute
document.querySelectorAll('.dropdown-item[data-tab]').forEach(item => {
  item.addEventListener('click', () => {
    const tab = item.dataset.tab;
    
    // Clear all tabs
    document.querySelectorAll('.tab-switch').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    
    // Show selected tab
    document.getElementById(tab).classList.add('active');
    
    // Close dropdown
    dropdown.classList.remove('show');
  });
});

document.addEventListener('click', () => {
  dropdown.classList.remove('show');
});

dropdown.addEventListener('click', (e) => {
  e.stopPropagation();
});

// Settings tab switching
document.querySelectorAll('.settings-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.settingsTab;
    
    // Update buttons
    document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Update panes
    document.querySelectorAll('.settings-tab-pane').forEach(p => p.classList.remove('active'));
    document.getElementById(tab).classList.add('active');
  });
});

