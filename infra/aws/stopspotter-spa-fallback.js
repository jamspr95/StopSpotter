// CloudFront Function — SPA fallback for the /stopspotter/* cache behavior only.
//
// Attach this as a "viewer request" function on the /stopspotter/* behavior
// specifically (not the distribution's default behavior) — see
// docs/AWS_CUSTOM_DOMAIN_HANDOFF.md. Scoping it to one behavior means a
// sibling app added at a different path later isn't affected by this.
//
// Same job GitHub Pages' dist/404.html copy and Cloudflare's
// not_found_handling: "single-page-application" do for this app elsewhere:
// any client-side route (e.g. /stopspotter/stop/abc123) that isn't a real
// file in the bucket should still load the SPA shell, not a bare S3 404.
function handler(event) {
  var request = event.request
  var uri = request.uri

  // Already a real file (has a dot in its last path segment, e.g.
  // /stopspotter/assets/index-ABC123.js or /stopspotter/favicon.svg) —
  // leave it alone, let it hit S3 normally.
  var lastSegment = uri.split('/').pop()
  if (lastSegment.indexOf('.') !== -1) {
    return request
  }

  request.uri = '/stopspotter/index.html'
  return request
}
