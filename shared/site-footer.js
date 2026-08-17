(function () {
  "use strict";

  if (document.querySelector(".site-author")) return;

  const footer = document.createElement("footer");
  footer.className = "site-author";
  footer.setAttribute("role", "contentinfo");
  footer.innerHTML =
    "<p>Created by <span class=\"site-author__name\">Julia Moss</span> &copy; All rights reserved</p>" +
    "<p class=\"site-author__promo\" hidden>" +
    "<a href=\"https://t.me/mosssblue\" target=\"_blank\" rel=\"noopener noreferrer\">Telegram @mosssblue</a>" +
    "<span aria-hidden=\"true\"> · </span>" +
    "<a href=\"https://instagram.com/mosssblue\" target=\"_blank\" rel=\"noopener noreferrer\">Instagram @mosssblue</a>" +
    "</p>";

  document.body.appendChild(footer);
})();
