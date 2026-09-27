// Show / hide the password on the login page. Served as a file so the CSP stays script-src 'self'.
var input = document.querySelector('input[name=password]');
var toggle = document.querySelector('.reveal');
if (input && toggle) {
  toggle.hidden = false;
  toggle.addEventListener('click', function () {
    var show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(show));
    toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    toggle.querySelector('.eye-off').style.display = show ? '' : 'none';
    toggle.querySelector('.eye-on').style.display = show ? 'none' : '';
    input.focus();
  });
}
