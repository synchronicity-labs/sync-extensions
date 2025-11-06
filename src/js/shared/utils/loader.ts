/**
 * Loader Component Helper
 * Creates animated loading bars (waves animation)
 */

export function loaderHTML(options: { size?: 'sm' | 'md' | 'lg'; color?: 'white' | 'primary' | 'muted'; className?: string } = {}): string {
  const {
    size = 'md',
    color = 'white',
    className = ''
  } = options;

  const classes = ['loader'];
  if (size === 'sm') classes.push('loader-sm');
  if (size === 'lg') classes.push('loader-lg');
  if (color === 'primary') classes.push('loader-primary');
  if (color === 'muted') classes.push('loader-muted');
  if (className) classes.push(className);

  const bars = Array(3).fill('<div class="loader-bar"></div>').join('');
  return `<div class="${classes.join(' ')}">${bars}</div>`;
}

export function createLoader(options: { size?: 'sm' | 'md' | 'lg'; color?: 'white' | 'primary' | 'muted'; className?: string } = {}): HTMLElement {
  const loader = document.createElement('div');
  loader.className = 'loader';
  
  if (options.size === 'sm') loader.classList.add('loader-sm');
  if (options.size === 'lg') loader.classList.add('loader-lg');
  if (options.color === 'primary') loader.classList.add('loader-primary');
  if (options.color === 'muted') loader.classList.add('loader-muted');
  if (options.className) loader.classList.add(...options.className.split(' '));
  
  for (let i = 0; i < 3; i++) {
    const bar = document.createElement('div');
    bar.className = 'loader-bar';
    loader.appendChild(bar);
  }
  
  return loader;
}

