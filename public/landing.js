// The launch spinner (src/ui/landing-pages.ts): the Home Screen app's first page, shown at once. It opens the page it
// names in its own place, so Back never comes back here; that request is the page's own, so it gets Home.
location.replace(document.documentElement.dataset.to || "/");
