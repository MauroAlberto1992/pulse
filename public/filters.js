// Applies the Logs filters as soon as a dropdown changes, instead of waiting for "Filter".
// Served as a file (not inline) so the page's CSP can stay script-src 'self'.
document.querySelectorAll('form.filters select').forEach(function (select) {
  select.addEventListener('change', function () {
    select.form.submit();
  });
});
