window.HELP_IMPROVE_VIDEOJS = false;

// Copy BibTeX to clipboard
function copyBibTeX() {
    const bibtexElement = document.getElementById('bibtex-code');
    const button = document.querySelector('.copy-bibtex-btn');
    const copyText = button.querySelector('.copy-text');
    
    if (bibtexElement) {
        navigator.clipboard.writeText(bibtexElement.textContent).then(function() {
            button.classList.add('copied');
            copyText.textContent = 'Copied!';
            
            setTimeout(function() {
                button.classList.remove('copied');
                copyText.textContent = 'Copy';
            }, 2000);
        }).catch(function(err) {
            console.error('Failed to copy: ', err);
            const textArea = document.createElement('textarea');
            textArea.value = bibtexElement.textContent;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            
            button.classList.add('copied');
            copyText.textContent = 'Copied!';
            setTimeout(function() {
                button.classList.remove('copied');
                copyText.textContent = 'Copy';
            }, 2000);
        });
    }
}

// Scroll to top functionality
function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

// Show/hide scroll to top button
window.addEventListener('scroll', function() {
    const scrollButton = document.querySelector('.scroll-to-top');
    if (window.pageYOffset > 300) {
        scrollButton.classList.add('visible');
    } else {
        scrollButton.classList.remove('visible');
    }
});

// Animation on scroll
function setupScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, {
        threshold: 0.1
    });
    
    const layers = document.querySelectorAll('.layer');
    const cards = document.querySelectorAll('.component-card');
    
    [...layers, ...cards].forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'all 0.6s ease-out';
        observer.observe(el);
    });
}

$(document).ready(function() {
    // Initialize scroll animations
    setupScrollAnimations();

    // Initialize any carousels if present
    if (typeof bulmaCarousel !== 'undefined') {
        var options = {
            slidesToScroll: 1,
            slidesToShow: 1,
            loop: true,
            infinite: true,
            autoplay: true,
            autoplaySpeed: 5000,
        };
        var carousels = bulmaCarousel.attach('.carousel', options);
    }

    // Wire up copy buttons on every <pre> in the page. Decorated once on
    // load — added buttons persist for the lifetime of the page.
    setupCodeCopyButtons();
});

// Decorate every <pre> with a top-right copy button. The button only becomes
// visible on hover/focus, so it does not interfere with the code visual. Uses
// the modern Clipboard API when available, falls back to document.execCommand
// for older browsers / non-HTTPS contexts.
function setupCodeCopyButtons() {
    var blocks = document.querySelectorAll('pre');
    for (var i = 0; i < blocks.length; i++) {
        var pre = blocks[i];
        // Skip if already decorated (e.g. by the bibtex handler).
        if (pre.querySelector(':scope > .code-copy-btn')) continue;

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'code-copy-btn';
        btn.setAttribute('aria-label', 'Copy code to clipboard');
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><span class="code-copy-label">Copy</span>';

        btn.addEventListener('click', (function(targetPre) {
            return function(ev) {
                ev.preventDefault();
                ev.stopPropagation();
                var code = targetPre.querySelector('code');
                var text = (code || targetPre).textContent || '';
                copyTextToClipboard(text).then(function() {
                    var label = btn.querySelector('.code-copy-label');
                    btn.classList.add('copied');
                    if (label) label.textContent = 'Copied';
                    setTimeout(function() {
                        btn.classList.remove('copied');
                        if (label) label.textContent = 'Copy';
                    }, 1500);
                });
            };
        })(pre));

        pre.style.position = 'relative';
        pre.appendChild(btn);
    }
}

function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
    }
    // Fallback for non-secure contexts (file://, etc.)
    return new Promise(function(resolve, reject) {
        try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            resolve();
        } catch (e) { reject(e); }
    });
}
