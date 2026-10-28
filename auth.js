(function () {
  // ซ่อนหน้าไว้ก่อน จนกว่าจะเช็กสิทธิ์เสร็จ
  document.documentElement.style.visibility = 'hidden';

  fetch('me.php')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (!data.ok) {
        location.href = 'login.html';
        return;
      }

      // หน้าไหนจำกัดสิทธิ์ ให้ใส่ data-roles ที่แท็ก <html>
      var allowed = document.documentElement.dataset.roles;
      if (allowed && allowed.split(',').indexOf(data.user.role) === -1) {
        alert('คุณไม่มีสิทธิ์เข้าหน้านี้');
        location.href = 'dashboard.html';
        return;
      }

      window.currentUser = data.user;
      document.documentElement.style.visibility = 'visible';
      document.dispatchEvent(new CustomEvent('auth-ready', { detail: data.user }));
    })
    .catch(function () {
      location.href = 'login.html';
    });
})();