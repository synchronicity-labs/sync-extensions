// Initialize Lucide icons when DOM is ready
function initLucideIcons() {
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
    
    // Override stroke-width for specific icons after Lucide renders
    setTimeout(() => {
      // Main icons (48px) - medium stroke
      document.querySelectorAll('.icon-main svg').forEach(svg => {
        svg.setAttribute('stroke-width', '2');
        svg.querySelectorAll('path, circle, rect, line, polyline, polygon').forEach(el => {
          el.setAttribute('stroke-width', '2');
        });
      });
      
      // Button icons (16px) - medium stroke
      document.querySelectorAll('.action-btn i svg, .audio-play-btn i svg').forEach(svg => {
        svg.setAttribute('stroke-width', '1.5');
        svg.querySelectorAll('path, circle, rect, line, polyline, polygon').forEach(el => {
          el.setAttribute('stroke-width', '1.5');
        });
      });
      
      // Float icons - thinner stroke
      document.querySelectorAll('.icon-float i svg, .icon-float svg').forEach(svg => {
        svg.setAttribute('stroke-width', '1');
        svg.querySelectorAll('path, circle, rect, line, polyline, polygon').forEach(el => {
          el.setAttribute('stroke-width', '1');
        });
      });
    }, 100);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLucideIcons);
} else {
  initLucideIcons();
}

// Also run when icons are dynamically added
const observer = new MutationObserver(() => {
  setTimeout(() => {
    document.querySelectorAll('.icon-main svg').forEach(svg => {
      if (svg.getAttribute('stroke-width') !== '2') {
        svg.setAttribute('stroke-width', '2');
        svg.querySelectorAll('path, circle, rect, line, polyline, polygon').forEach(el => {
          el.setAttribute('stroke-width', '2');
        });
      }
    });
    
    document.querySelectorAll('.action-btn i svg, .audio-play-btn i svg').forEach(svg => {
      if (svg.getAttribute('stroke-width') !== '1.5') {
        svg.setAttribute('stroke-width', '1.5');
        svg.querySelectorAll('path, circle, rect, line, polyline, polygon').forEach(el => {
          el.setAttribute('stroke-width', '1.5');
        });
      }
    });
    
    document.querySelectorAll('.icon-float i svg, .icon-float svg').forEach(svg => {
      if (svg.getAttribute('stroke-width') !== '1') {
        svg.setAttribute('stroke-width', '1');
        svg.querySelectorAll('path, circle, rect, line, polyline, polygon').forEach(el => {
          el.setAttribute('stroke-width', '1');
        });
      }
    });
  }, 50);
});

observer.observe(document.body, { childList: true, subtree: true });

