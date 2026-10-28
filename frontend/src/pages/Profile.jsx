import { useEffect, useState } from 'react';
import '../styles/profile.css';

const NAV = [['Dashboard','/dashboard'],['POS ขายสินค้า','/'],['สินค้า','/product'],['สต็อกสินค้า','/stock'],['รายงานยอดขาย','/report'],['จัดการผู้ใช้งาน','/users'],['หน้าโปรไฟล์ / ตั้งค่า','/profile']];
const DEFAULTS = {shop_name:'ร้านขายของชำ',shop_address:'',shop_phone:'',shop_email:'',receipt_footer:'ขอบคุณที่อุดหนุน',receipt_show_phone:true,receipt_show_address:true,receipt_show_logo:false,receipt_logo_url:'',paper_size:'80mm',notify_low_stock:true,notify_sales:true,confirm_delete:true};
async function api(path, options={}) {
  const response=await fetch('/api/'+path,{credentials:'include',...options});
  const raw=await response.text();let data;
  try {data=JSON.parse(raw);} catch {throw new Error('เซิร์ฟเวอร์ไม่ได้ส่ง JSON กรุณาตรวจสอบ PHP Backend');}
  if(!response.ok || !data.ok) throw new Error(data.message || 'ไม่สามารถดำเนินการได้');
  return data;
}
function Toggle({
  checked,
  onChange,
  disabled,
  label = "เปิดหรือปิดการตั้งค่า"
}) {
  return (
    <label className="pv-switch">
      <input
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        aria-label={label}
      />
      <span aria-hidden="true" />
      <span className="pv-sr-only">{label}</span>
    </label>
  );
}
function Row({title,desc,children}) {return <div className="pv-setting-row"><div><strong>{title}</strong><p>{desc}</p></div><div className="pv-setting-action">{children}</div></div>;}
export default function Profile(){
  const [tab,setTab]=useState('store'); const [user,setUser]=useState(null); const [settings,setSettings]=useState(DEFAULTS); const [original,setOriginal]=useState(DEFAULTS);
  const [editing,setEditing]=useState(false),[profileForm,setProfileForm]=useState({full_name:'',phone:''});
  const [theme,setTheme]=useState(()=>localStorage.getItem('grocery-theme')||'light');
  const [density,setDensity]=useState(()=>localStorage.getItem('grocery-density')||'normal');
  const [events,setEvents]=useState([]); const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [logoutConfirm,setLogoutConfirm]=useState(false);
  const owner=user?.role==='owner';
  const change=(key,value)=>{if(!owner)return;setSettings(s=>({...s,[key]:value}));};
  async function load(){setError('');setLoading(true);try{
    const [p,s]=await Promise.all([api('profile.php'),api('settings.php')]);setUser(p.user);setProfileForm({full_name:p.user.full_name||'',phone:p.user.phone||''});
    setSettings({...DEFAULTS,...s.settings});setOriginal({...DEFAULTS,...s.settings});
    try {const activity=await api('activity.php');setEvents(activity.events||[]);} catch {setEvents([]);}
  }catch(e){setError(e.message);}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  useEffect(()=>{localStorage.setItem('grocery-theme',theme);localStorage.setItem('grocery-density',density);document.documentElement.dataset.groceryTheme=theme;return ()=>{delete document.documentElement.dataset.groceryTheme;};},[theme,density]);
  async function saveSettings(e){e.preventDefault();if(!owner)return;setSaving(true);setError('');setNotice('');try{const d=await api('settings.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(settings)});setSettings(d.settings);setOriginal(d.settings);setNotice('บันทึกการตั้งค่าเรียบร้อยแล้ว');}catch(e){setError(e.message);}finally{setSaving(false);}}
  async function saveProfile(e){e.preventDefault();setSaving(true);setError('');setNotice('');try{const d=await api('profile.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(profileForm)});setUser(d.user);setEditing(false);setNotice('บันทึกข้อมูลส่วนตัวเรียบร้อยแล้ว');}catch(e){setError(e.message);}finally{setSaving(false);}}
  async function logout(){
    if(saving)return;
    setSaving(true);
    setError('');
    try{
      await api('logout.php',{method:'POST',cache:'no-store'});
      sessionStorage.clear();
      window.location.replace('/login');
    }catch(e){
      setError(e.message||'ออกจากระบบไม่สำเร็จ');
      setLogoutConfirm(false);
      setSaving(false);
    }
  }
  async function backup(){if(!owner)return;setError('');setNotice('');try{const r=await fetch('/api/backup.php',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok){const x=await r.json().catch(()=>({}));throw new Error(x.message||'สำรองข้อมูลไม่สำเร็จ');}const blob=await r.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='grocery_backup_'+new Date().toISOString().slice(0,10)+'.sql';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('ดาวน์โหลดไฟล์สำรองข้อมูลแล้ว โปรดจัดเก็บอย่างปลอดภัย');}catch(e){setError(e.message);}}
  return <div className={'pv-root '+(theme==='dark'?'pv-dark ':'')+(density==='compact'?'pv-compact':'')}>
    <aside className="pv-sidebar"><div className="pv-logo">🛒</div><div className="pv-shop">{settings.shop_name||'ร้านขายของชำ'}</div><nav>{NAV.map(([title,url])=><a key={url} href={url} className={url==='/profile'?'active':''}>{title}</a>)}</nav></aside>
    <main className="pv-main"><div className="pv-header"><div><h1>โปรไฟล์ / ตั้งค่า</h1><p>จัดการข้อมูลร้านค้าและการตั้งค่าระบบ</p></div><button type="button" className="pv-outline" onClick={()=>{void load();}}>↻ รีเฟรช</button></div>
      {error&&<div className="pv-alert pv-error">{error}</div>}{notice&&<div className="pv-alert pv-success">{notice}</div>}
      {loading?<div className="pv-card">กำลังโหลดข้อมูล...</div>:user&&<div className="pv-card pv-board">
        <div className="pv-tabs" role="tablist"><button type="button" className={tab==='store'?'selected':''} onClick={()=>setTab('store')}>ข้อมูลร้าน</button><button type="button" className={tab==='system'?'selected':''} onClick={()=>setTab('system')}>ตั้งค่าระบบ</button></div>
        {tab==='store'?<form onSubmit={e=>{void saveSettings(e);}}>
          <h2>🏪 ข้อมูลร้านค้า</h2><p className="pv-muted">จัดการข้อมูลพื้นฐานของร้านขายของชำ</p>
          <div className="pv-store-identity"><div className="pv-avatar">🛒</div><div><strong>{settings.shop_name||'ร้านขายของชำ'}</strong><p>ข้อมูลร้านค้า</p><span className="pv-chip">เปิดให้บริการ</span></div></div>
          <div className="pv-separator"/>
          <div className="pv-form-grid">
            <label htmlFor="pv-name">ชื่อร้าน</label><input id="pv-name" value={settings.shop_name} maxLength={120} onChange={e=>change('shop_name',e.target.value)} disabled={!owner} required/>
            <label htmlFor="pv-address">ที่อยู่</label><textarea id="pv-address" rows={3} maxLength={300} value={settings.shop_address} onChange={e=>change('shop_address',e.target.value)} disabled={!owner}/>
            <label htmlFor="pv-phone">เบอร์โทร</label><input id="pv-phone" maxLength={20} value={settings.shop_phone} onChange={e=>change('shop_phone',e.target.value)} disabled={!owner}/>
            <label htmlFor="pv-email">อีเมล</label><input id="pv-email" type="email" maxLength={150} value={settings.shop_email} onChange={e=>change('shop_email',e.target.value)} disabled={!owner}/>
          </div>
          {owner&&<div className="pv-form-actions"><button type="submit" className="pv-primary" disabled={saving}>💾 บันทึกข้อมูล</button><button type="button" className="pv-outline" onClick={()=>setSettings(original)}>ยกเลิกการแก้ไข</button></div>}
          <div className="pv-section-divider"/><h2>🧾 ตั้งค่าใบเสร็จ</h2><p className="pv-muted">ค่าที่บันทึกไว้ให้ระบบ POS นำไปใช้เมื่อเชื่อมการพิมพ์ใบเสร็จ</p>
          <div className="pv-form-grid"><label htmlFor="pv-footer">ข้อความท้ายใบเสร็จ</label><input id="pv-footer" maxLength={250} value={settings.receipt_footer} onChange={e=>change('receipt_footer',e.target.value)} disabled={!owner}/><label htmlFor="pv-paper">ขนาดกระดาษ</label><select id="pv-paper" value={settings.paper_size} onChange={e=>change('paper_size',e.target.value)} disabled={!owner}><option value="58mm">58 มม.</option><option value="80mm">80 มม.</option><option value="A4">A4</option></select><label htmlFor="pv-logo-url">URL โลโก้ (HTTPS)</label><input id="pv-logo-url" placeholder="https://..." value={settings.receipt_logo_url} onChange={e=>change('receipt_logo_url',e.target.value)} disabled={!owner}/></div>
          <div className="pv-settings-list"><Row title="แสดงที่อยู่บนใบเสร็จ" desc="แสดงที่อยู่ร้านเมื่อพิมพ์ใบเสร็จ"><Toggle label="แสดงที่อยู่บนใบเสร็จ" checked={settings.receipt_show_address} disabled={!owner} onChange={v=>change('receipt_show_address',v)}/></Row><Row title="แสดงเบอร์โทรร้าน" desc="พิมพ์เบอร์ติดต่อบนใบเสร็จ"><Toggle label="แสดงเบอร์โทรร้าน" checked={settings.receipt_show_phone} disabled={!owner} onChange={v=>change('receipt_show_phone',v)}/></Row><Row title="แสดงโลโก้ร้าน" desc="ใช้ URL โลโก้ที่กรอกด้านบน"><Toggle label="แสดงโลโก้ร้าน" checked={settings.receipt_show_logo} disabled={!owner} onChange={v=>change('receipt_show_logo',v)}/></Row></div>
          {owner&&<div className="pv-form-actions"><button className="pv-primary" type="submit" disabled={saving}>💾 บันทึกข้อมูลร้านและใบเสร็จ</button></div>}
        </form>:<div>
          <h2>⚙️ ตั้งค่าระบบ</h2><p className="pv-muted">กำหนดการทำงานและรูปแบบการแจ้งเตือนของระบบ</p>
          <form onSubmit={e=>{void saveSettings(e);}}><div className="pv-settings-list">
            <Row title="🔔 แจ้งเตือนสินค้าใกล้หมด" desc="เก็บค่าการแจ้งเตือนเมื่อสินค้าเหลือ 5 ชิ้นหรือน้อยกว่า"><Toggle label="แจ้งเตือนสินค้าใกล้หมด" checked={settings.notify_low_stock} onChange={v=>change('notify_low_stock',v)} disabled={!owner}/></Row>
            <Row title="💰 แจ้งเตือนยอดขาย" desc="เปิดหรือปิดการแจ้งเตือนเมื่อมีการขายสินค้า"><Toggle label="แจ้งเตือนยอดขาย" checked={settings.notify_sales} onChange={v=>change('notify_sales',v)} disabled={!owner}/></Row>
            <Row title="🗑️ ยืนยันก่อนลบข้อมูล" desc="ตั้งค่าว่าต้องแสดงข้อความยืนยันก่อนลบข้อมูลสำคัญ"><Toggle label="ยืนยันก่อนลบข้อมูล" checked={settings.confirm_delete} onChange={v=>change('confirm_delete',v)} disabled={!owner}/></Row>
            <Row title="🌙 โหมดมืด" desc="เปลี่ยนธีมของหน้าโปรไฟล์นี้"><Toggle label="โหมดมืด" checked={theme==='dark'} onChange={v=>setTheme(v?'dark':'light')}/></Row>
            <Row title="📋 รูปแบบการแสดงผล" desc="ตั้งค่าความหนาแน่นของข้อมูลในหน้าโปรไฟล์"><select aria-label="รูปแบบการแสดงผล" value={density} onChange={e=>setDensity(e.target.value)}><option value="normal">ปกติ</option><option value="compact">กระชับ</option></select></Row>
          </div><div className="pv-form-actions">{owner&&<button type="submit" className="pv-primary" disabled={saving}>💾 บันทึกการตั้งค่า</button>}<button type="button" className="pv-outline" onClick={()=>{if(owner){setSettings(s=>({...s,notify_low_stock:true,notify_sales:true,confirm_delete:true}));setNotice('คืนค่าการแจ้งเตือนบนหน้าจอแล้ว กดบันทึกการตั้งค่าเพื่อยืนยัน');}else{setNotice('คืนค่าการแสดงผลเฉพาะบัญชีนี้แล้ว');}setTheme('light');setDensity('normal');}}>↩ คืนค่าเริ่มต้น</button></div></form>
          <div className="pv-section-divider"/><h2>👤 บัญชีของฉัน</h2>
          <div className="pv-profile-line"><div className="pv-avatar small">{(user.full_name||user.username||'?').slice(0,1)}</div><div><b>{user.full_name||user.username}</b><p>@{user.username} · {owner?'เจ้าของร้าน':'พนักงานขาย'}</p></div></div>
          {editing?<form className="pv-account-form" onSubmit={e=>{void saveProfile(e);}}><label>ชื่อ-นามสกุล<input value={profileForm.full_name} onChange={e=>setProfileForm(f=>({...f,full_name:e.target.value}))} required/></label><label>เบอร์โทร<input value={profileForm.phone} onChange={e=>setProfileForm(f=>({...f,phone:e.target.value}))}/></label><div className="pv-form-actions"><button type="submit" className="pv-primary" disabled={saving}>บันทึกข้อมูลส่วนตัว</button><button type="button" className="pv-outline" onClick={()=>setEditing(false)}>ยกเลิก</button></div></form>:<div className="pv-inline-buttons"><button type="button" className="pv-outline" onClick={()=>setEditing(true)}>✎ แก้ไขชื่อ / เบอร์โทร</button><button type="button" className="pv-outline pv-danger" onClick={()=>setLogoutConfirm(true)}>ออกจากระบบ</button></div>}
          <div className="pv-section-divider"/><h2>🕘 ประวัติการตั้งค่า</h2>{events.length?<div className="pv-audit">{events.slice(0,15).map((x,i)=><div key={i}><span><strong>{x.username}</strong> — {x.description||x.action}</span><small>{x.created_at}</small></div>)}</div>:<p className="pv-muted">ยังไม่มีประวัติที่บันทึกไว้ (ระบบนี้จะแสดงประวัติจากฟังก์ชันตั้งค่าใหม่)</p>}
          {owner&&<><div className="pv-section-divider"/><h2>🗄️ สำรองข้อมูล</h2><p className="pv-muted">ดาวน์โหลดฐานข้อมูล SQL สำหรับเก็บสำรอง ไฟล์มีข้อมูลส่วนบุคคลและแฮชรหัสผ่าน โปรดเก็บเป็นความลับ</p><button type="button" className="pv-outline" onClick={()=>{void backup();}}>⬇ ดาวน์โหลดไฟล์สำรองข้อมูล SQL</button></>}
        </div>}
      </div>}
    </main>
    {logoutConfirm&&<div className="pv-overlay"><div className="pv-modal"><h2>ยืนยันออกจากระบบ</h2><p>ต้องการออกจากระบบบัญชีนี้หรือไม่?</p><div className="pv-inline-buttons"><button type="button" className="pv-primary" onClick={()=>{void logout();}} disabled={saving}>ออกจากระบบ</button><button type="button" className="pv-outline" onClick={()=>setLogoutConfirm(false)}>ยกเลิก</button></div></div></div>}
  </div>;
}
