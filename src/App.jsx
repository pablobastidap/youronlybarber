import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import "./App.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const DEFAULT_SETTINGS = {
  id: 1,
  admin_password: "1234",
  brand: "Hairy",
  hero_title: "We Will Make You Stylish",
  hero_subtitle: "Cortes limpios, degradados, barba, cejas y diseño. Solicita tu cita y te confirmaré manualmente por WhatsApp.",
  phone: "34699776068",
  background_url: "https://imgs.search.brave.com/f2ZjguQyvP0To614u4Xuf-MQY0bOcS7ew_o0gjI4Z9o/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9wbHVzLnVuc3BsYXNoLmNvbS9wcmVtaXVtX3Bob3RvLTE2NjEzODA1NTg4NTktNDBkZjhkZDkxZGZkP2ZtPWpwZyZxPTYwJnc9MzAwMCZpeGxpYj1yYi00LjEuMCZpeGlkPU0zZHhNakEzZkRCOE1IeHpaV0Z5WTJoOE5YbDhZbUZ5WW1WeWZHbHVfREI4ZkRCOGZId3c",
  home_kicker: "Barbería privada · cita previa",
  services_title: "Elige tu estilo",
  booking_title: "Responde paso a paso",
  booking_text: "La web no confirma automáticamente. Tú me envías la solicitud y yo te confirmo manualmente por WhatsApp.",
  duration_text: "30’ - 1h15’",
  duration_subtext: "Duración según pedido",
  cut_time_text: "45’",
  cut_time_subtext: "Corte aprox.",
  home_extra_price: 2,
};

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const SHORT_DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function toLocalDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfWeek(date = new Date()) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function getCurrentWeekDays() {
  const start = startOfWeek();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      dateString: toLocalDateString(date),
      dayName: DAY_NAMES[date.getDay()],
      shortName: SHORT_DAY_NAMES[date.getDay()],
      dayNumber: date.getDate(),
    };
  });
}

function formatDateLabel(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return `${DAY_NAMES[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}`;
}

function slotLabel(slot) {
  if (slot.schedule_date && slot.schedule_time) {
    return `${formatDateLabel(slot.schedule_date)} ${slot.schedule_time.slice(0, 5)}`;
  }
  return slot.label;
}

function sortByDateTime(a, b) {
  const aKey = `${a.schedule_date || "9999-99-99"} ${a.schedule_time || "99:99"}`;
  const bKey = `${b.schedule_date || "9999-99-99"} ${b.schedule_time || "99:99"}`;
  return aKey.localeCompare(bKey);
}

export default function App() {
  const isAdmin = window.location.pathname === "/admin";
  return isAdmin ? <AdminPanel /> : <BookingWebsite />;
}

function BookingWebsite() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [services, setServices] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [step, setStep] = useState(0);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({
    name: "",
    contact: "",
    service: "",
    scheduleId: null,
    time: "",
    homeService: "No",
    address: "",
    note: "",
  });

  const weekDays = useMemo(() => getCurrentWeekDays(), []);
  const weekStart = weekDays[0].dateString;
  const weekEnd = weekDays[6].dateString;

  useEffect(() => {
    loadPublicData();
  }, []);

  async function loadPublicData() {
    const { data: settingsData } = await supabase.from("settings").select("*").eq("id", 1).single();
    const { data: servicesData } = await supabase.from("services").select("*").eq("active", true).order("position", { ascending: true });
    const { data: schedulesData } = await supabase
      .from("schedules")
      .select("*")
      .eq("active", true)
      .gte("schedule_date", weekStart)
      .lte("schedule_date", weekEnd)
      .order("schedule_date", { ascending: true })
      .order("schedule_time", { ascending: true });

    if (settingsData) setSettings(settingsData);
    if (servicesData) setServices(servicesData);
    if (schedulesData) setSchedules(schedulesData);
  }

  const selectedService = services.find((service) => service.name === form.service);

  const total = useMemo(() => {
    const base = Number(selectedService?.price || 0);
    const home = form.homeService === "Sí" ? Number(settings.home_extra_price || 0) : 0;
    return base + home;
  }, [selectedService, form.homeService, settings.home_extra_price]);

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function nextStep() {
    if (step === 1 && !form.service) return alert("Elige un tipo de corte.");
    if (step === 2 && !form.scheduleId) return alert("Elige un horario disponible.");
    if (step === 3 && form.homeService === "Sí" && !form.address.trim()) return alert("Escribe tu dirección.");
    setStep((prev) => prev + 1);
  }

  async function sendBooking(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.contact.trim()) return alert("Completa tu nombre y contacto.");

    setSending(true);

    const booking = {
      customer_name: form.name,
      contact: form.contact,
      service: form.service,
      schedule_id: form.scheduleId,
      schedule_label: form.time,
      home_service: form.homeService,
      address: form.address || null,
      note: form.note || null,
      total,
      status: "Pendiente",
    };

    const { error } = await supabase.from("bookings").insert([booking]);

    if (error) {
      setSending(false);
      alert("No se pudo enviar la solicitud. Inténtalo otra vez.");
      return;
    }

    await supabase.from("schedules").update({ active: false }).eq("id", form.scheduleId);

    setSending(false);
    setSent(true);
    loadPublicData();
  }

  return (
    <main>
      <header className="nav">
        <a className="brand" href="/">
          <span>{settings.brand}</span>
        </a>
        <nav>
          <a href="#servicios">Servicios</a>
          <a href="#reserva">Reserva</a>
          <a href={`https://wa.me/${settings.phone}`}>WhatsApp</a>
        </nav>
      </header>

      <section className="heroSection" style={{ backgroundImage: `url(${settings.background_url})` }}>
        <div className="overlay" />
        <div className="heroContent">
          <p className="kicker">{settings.home_kicker}</p>
          <h1>{settings.hero_title}</h1>
          <p className="subtitle">{settings.hero_subtitle}</p>
          <div className="heroActions">
            <a href="#reserva" className="goldButton">Empezar reserva</a>
            <a href={`https://wa.me/${settings.phone}`} className="outlineButton">Hablar por WhatsApp</a>
          </div>
        </div>
      </section>

      <section id="servicios" className="servicesSection">
        <p className="sectionLabel">Servicios</p>
        <h2>{settings.services_title}</h2>
        <div className="serviceCards">
          {services.map((service) => (
            <article key={service.id}>
              <h3>{service.name}</h3>
              <p>{service.description}</p>
              <b>{service.price}€</b>
            </article>
          ))}
        </div>
      </section>

      <section id="reserva" className="bookingSection">
        <div className="bookingIntro">
          <p className="sectionLabel">Reserva guiada</p>
          <h2>{settings.booking_title}</h2>
          <p>{settings.booking_text}</p>
          <div className="infoGrid">
            <div><b>{settings.duration_text}</b><span>{settings.duration_subtext}</span></div>
            <div><b>{settings.cut_time_text}</b><span>{settings.cut_time_subtext}</span></div>
            <div><b>+{settings.home_extra_price}€</b><span>A domicilio</span></div>
          </div>
        </div>

        <div className="bookingCard">
          {sent ? (
            <div className="step successStep">
              <p className="miniTitle">Solicitud enviada</p>
              <h3>Tu solicitud ha sido recibida</h3>
              <p>Te escribiré por WhatsApp para confirmar la cita manualmente.</p>
              <button type="button" className="mainButton full" onClick={() => window.location.reload()}>Hacer otra solicitud</button>
            </div>
          ) : (
            <>
              <div className="progress">
                {[0, 1, 2, 3, 4].map((number) => <span key={number} className={step >= number ? "done" : ""} />)}
              </div>

              {step === 0 && (
                <Step title="Antes de empezar" text="Te haré unas preguntas rápidas para preparar tu solicitud de cita.">
                  <button type="button" className="mainButton full" onClick={() => setStep(1)}>Empezar</button>
                </Step>
              )}

              {step === 1 && (
                <Step title="¿Qué servicio quieres?" text="Elige el corte o extra que necesitas.">
                  <div className="optionsList serviceGrid">
                    {services.map((service) => (
                      <button type="button" key={service.id} onClick={() => updateForm("service", service.name)} className={form.service === service.name ? "option active" : "option"}>
                        <span><b>{service.name}</b><small>{service.description}</small></span>
                        <strong>{service.price}€</strong>
                      </button>
                    ))}
                  </div>
                  <FooterButtons back={() => setStep(0)} next={nextStep} />
                </Step>
              )}

              {step === 2 && (
                <Step title="Elige horario de esta semana" text="Solo se muestran los horarios publicados para esta semana.">
                  <ClientWeekPicker
                    weekDays={weekDays}
                    schedules={schedules}
                    selectedId={form.scheduleId}
                    onSelect={(schedule) => {
                      updateForm("scheduleId", schedule.id);
                      updateForm("time", slotLabel(schedule));
                    }}
                  />
                  <FooterButtons back={() => setStep(1)} next={nextStep} />
                </Step>
              )}

              {step === 3 && (
                <Step title="¿Quieres cita a domicilio?" text={`Tiene un suplemento de ${settings.home_extra_price}€.`}>
                  <div className="choiceGrid">
                    <button type="button" onClick={() => updateForm("homeService", "Sí")} className={form.homeService === "Sí" ? "active" : ""}>Sí, a domicilio</button>
                    <button type="button" onClick={() => updateForm("homeService", "No")} className={form.homeService === "No" ? "active" : ""}>No</button>
                  </div>

                  {form.homeService === "Sí" && (
                    <div className="addressBox">
                      <label>Dirección para ir a domicilio</label>
                      <input value={form.address} onChange={(e) => updateForm("address", e.target.value)} placeholder="Ej: Calle, número, piso, zona..." />
                    </div>
                  )}

                  <FooterButtons back={() => setStep(2)} next={nextStep} />
                </Step>
              )}

              {step === 4 && (
                <Step title="Tus datos" text="Déjame tu contacto para responderte y confirmar la cita.">
                  <form onSubmit={sendBooking} className="finalForm">
                    <input required value={form.name} onChange={(e) => updateForm("name", e.target.value)} placeholder="Nombre y apellido" />
                    <input required value={form.contact} onChange={(e) => updateForm("contact", e.target.value)} placeholder="Número o Instagram" />
                    <textarea rows="3" value={form.note} onChange={(e) => updateForm("note", e.target.value)} placeholder="Nota extra: degradado bajo, diseño, barba..." />
                    <div className="summaryBox">
                      <span>{form.service || "Servicio"}</span>
                      <span>{form.time || "Horario"}</span>
                      <span>A domicilio: {form.homeService}</span>
                      <b>Total aprox. {total}€</b>
                    </div>
                    <div className="stepButtons">
                      <button type="button" className="backButton" onClick={() => setStep(3)}>Atrás</button>
                      <button type="submit" className="mainButton" disabled={sending}>{sending ? "Enviando..." : "Enviar solicitud"}</button>
                    </div>
                    <p className="notice">La cita queda pendiente hasta que yo te confirme manualmente.</p>
                  </form>
                </Step>
              )}
            </>
          )}
        </div>
      </section>

      <footer className="privateFooter">
        <a href="/admin">acceso privado</a>
      </footer>
    </main>
  );
}

function ClientWeekPicker({ weekDays, schedules, selectedId, onSelect }) {
  const grouped = weekDays.map((day) => ({
    ...day,
    slots: schedules.filter((schedule) => schedule.schedule_date === day.dateString).sort(sortByDateTime),
  }));

  return (
    <div className="clientWeekPicker">
      {grouped.map((day) => (
        <div className="clientDay" key={day.dateString}>
          <div className="clientDayHeader">
            <b>{day.dayName}</b>
            <span>{day.dayNumber}</span>
          </div>
          <div className="clientSlots">
            {day.slots.length > 0 ? day.slots.map((slot) => (
              <button type="button" key={slot.id} onClick={() => onSelect(slot)} className={selectedId === slot.id ? "clientSlot active" : "clientSlot"}>
                {slot.schedule_time?.slice(0, 5)}
              </button>
            )) : <span className="noSlots">Sin horarios</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Step({ title, text, children }) {
  return (
    <div className="step">
      <p className="miniTitle">Paso de reserva</p>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}

function FooterButtons({ back, next }) {
  return (
    <div className="stepButtons">
      <button type="button" className="backButton" onClick={back}>Atrás</button>
      <button type="button" className="mainButton" onClick={next}>Siguiente</button>
    </div>
  );
}

function AdminPanel() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState("calendario");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [services, setServices] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [newService, setNewService] = useState({ name: "", description: "", price: "" });
  const [newSlot, setNewSlot] = useState({ schedule_date: toLocalDateString(new Date()), schedule_time: "10:00" });
  const [newSchedule, setNewSchedule] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const weekDays = useMemo(() => getCurrentWeekDays(), []);
  const weekStart = weekDays[0].dateString;
  const weekEnd = weekDays[6].dateString;

  useEffect(() => {
    loadLoginSettings();
  }, []);

  useEffect(() => {
    if (loggedIn) loadAdminData();
  }, [loggedIn]);

  async function loadLoginSettings() {
    const { data: settingsData } = await supabase.from("settings").select("*").eq("id", 1).single();
    if (settingsData) setSettings(settingsData);
  }

  async function loadAdminData() {
    const { data: settingsData } = await supabase.from("settings").select("*").eq("id", 1).single();
    const { data: servicesData } = await supabase.from("services").select("*").order("position", { ascending: true });
    const { data: schedulesData } = await supabase.from("schedules").select("*").gte("schedule_date", weekStart).lte("schedule_date", weekEnd).order("schedule_date", { ascending: true }).order("schedule_time", { ascending: true });
    const { data: bookingsData } = await supabase.from("bookings").select("*").order("created_at", { ascending: false });

    if (settingsData) setSettings(settingsData);
    if (servicesData) setServices(servicesData);
    if (schedulesData) setSchedules(schedulesData);
    if (bookingsData) setBookings(bookingsData);
  }

  function login(e) {
    e.preventDefault();
    if (password === settings.admin_password) {
      setLoggedIn(true);
      setError("");
    } else {
      setError("Contraseña incorrecta");
    }
  }

  function flashSaved(text = "Guardado correctamente.") {
    setSaved(text);
    setTimeout(() => setSaved(""), 1800);
  }

  async function updateSettings(field, value) {
    const next = { ...settings, [field]: value };
    setSettings(next);
    await supabase.from("settings").update({ [field]: value }).eq("id", 1);
    flashSaved();
  }

  async function addService() {
    if (!newService.name.trim() || !newService.price) return alert("Pon nombre y precio.");
    await supabase.from("services").insert([{ name: newService.name, description: newService.description, price: Number(newService.price), active: true, position: services.length + 1 }]);
    setNewService({ name: "", description: "", price: "" });
    loadAdminData();
  }

  async function updateService(id, field, value) {
    const finalValue = field === "price" || field === "position" ? Number(value) : value;
    setServices(services.map((service) => (service.id === id ? { ...service, [field]: finalValue } : service)));
    await supabase.from("services").update({ [field]: finalValue }).eq("id", id);
    flashSaved();
  }

  async function deleteService(id) {
    await supabase.from("services").delete().eq("id", id);
    loadAdminData();
  }

  async function addCalendarSlot() {
    if (!newSlot.schedule_date || !newSlot.schedule_time) return;
    const label = `${formatDateLabel(newSlot.schedule_date)} ${newSlot.schedule_time}`;
    await supabase.from("schedules").insert([{ label, schedule_date: newSlot.schedule_date, schedule_time: newSlot.schedule_time, active: true }]);
    loadAdminData();
  }

  async function updateSchedule(id, field, value) {
    setSchedules(schedules.map((schedule) => (schedule.id === id ? { ...schedule, [field]: value } : schedule)));
    await supabase.from("schedules").update({ [field]: value }).eq("id", id);
    flashSaved();
  }

  async function deleteSchedule(id) {
    await supabase.from("schedules").delete().eq("id", id);
    loadAdminData();
  }

  async function updateBookingStatus(booking, status) {
    await supabase.from("bookings").update({ status }).eq("id", booking.id);
    loadAdminData();
  }

  async function rejectBooking(booking) {
    await supabase.from("bookings").delete().eq("id", booking.id);
    if (booking.schedule_id) await supabase.from("schedules").update({ active: true }).eq("id", booking.schedule_id);
    setSelectedBooking(null);
    loadAdminData();
  }

  async function deleteBooking(booking) {
    if (!confirm("¿Quieres borrar esta reserva?")) return;
    await supabase.from("bookings").delete().eq("id", booking.id);
    if (booking.schedule_id) await supabase.from("schedules").update({ active: true }).eq("id", booking.schedule_id);
    setSelectedBooking(null);
    loadAdminData();
  }

  function openWhatsapp(booking) {
    const clean = String(booking.contact || "").replace(/[^0-9]/g, "");
    const message = `Hola ${booking.customer_name}, soy el barbero. Te escribo por tu solicitud para ${booking.service} el ${booking.schedule_label}.`;
    if (clean.length >= 8) window.open(`https://wa.me/${clean}?text=${encodeURIComponent(message)}`, "_blank");
    else window.open(`https://wa.me/${settings.phone}`, "_blank");
  }

  function getBookingForSchedule(schedule) {
    return bookings.find((booking) => booking.schedule_id === schedule.id);
  }

  return (
    <main className="adminPage">
      <section className="adminBox wide">
        <a className="backLink" href="/">← Volver a la web</a>
        <p className="sectionLabel">Zona privada</p>
        <h1>Panel admin</h1>
        <p>Calendario semanal claro: gris libre, naranja pendiente, verde confirmada.</p>

        {!loggedIn ? (
          <form className="adminForm" onSubmit={login}>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña admin" />
            {error && <span className="error">{error}</span>}
            <button type="submit" className="mainButton">Entrar</button>
          </form>
        ) : (
          <div className="adminPanel">
            <div className="adminTabs">
              <button className={tab === "calendario" ? "tabActive" : ""} onClick={() => setTab("calendario")}>Calendario</button>
              <button className={tab === "reservas" ? "tabActive" : ""} onClick={() => setTab("reservas")}>Reservas</button>
              <button className={tab === "general" ? "tabActive" : ""} onClick={() => setTab("general")}>General</button>
              <button className={tab === "servicios" ? "tabActive" : ""} onClick={() => setTab("servicios")}>Servicios</button>
              <button className={tab === "horarios" ? "tabActive" : ""} onClick={() => setTab("horarios")}>Horarios</button>
              <button className={tab === "seguridad" ? "tabActive" : ""} onClick={() => setTab("seguridad")}>Seguridad</button>
            </div>

            {saved && <p className="success">{saved}</p>}

            {tab === "calendario" && (
              <div className="adminCalendarWrap">
                <div className="legend">
                  <span><i className="legendFree" /> Libre</span>
                  <span><i className="legendPending" /> Pendiente</span>
                  <span><i className="legendConfirmed" /> Confirmada</span>
                </div>
                <AdminWeekCalendar
                  weekDays={weekDays}
                  schedules={schedules}
                  getBookingForSchedule={getBookingForSchedule}
                  selectedBooking={selectedBooking}
                  setSelectedBooking={setSelectedBooking}
                />
                {selectedBooking && (
                  <BookingDetails booking={selectedBooking} openWhatsapp={openWhatsapp} confirmBooking={() => updateBookingStatus(selectedBooking, "Confirmada")} rejectBooking={() => rejectBooking(selectedBooking)} deleteBooking={() => deleteBooking(selectedBooking)} />
                )}
              </div>
            )}

            {tab === "reservas" && (
              <div className="adminList">
                {bookings.map((booking) => (
                  <div className="bookingItem" key={booking.id} onClick={() => setSelectedBooking(booking)}>
                    <div className="bookingHead"><div><b>{booking.customer_name}</b><span>{booking.status}</span></div><small>{new Date(booking.created_at).toLocaleString()}</small></div>
                    <div className="bookingDetails"><p><b>Contacto:</b> {booking.contact}</p><p><b>Servicio:</b> {booking.service}</p><p><b>Horario:</b> {booking.schedule_label}</p><p><b>Total:</b> {booking.total}€</p></div>
                  </div>
                ))}
                {bookings.length === 0 && <p className="empty">Todavía no hay reservas.</p>}
              </div>
            )}

            {tab === "general" && (
              <div className="adminForm">
                <label>Nombre/logo<input value={settings.brand || ""} onChange={(e) => updateSettings("brand", e.target.value)} /></label>
                <label>Título principal<input value={settings.hero_title || ""} onChange={(e) => updateSettings("hero_title", e.target.value)} /></label>
                <label>Subtítulo<textarea rows="3" value={settings.hero_subtitle || ""} onChange={(e) => updateSettings("hero_subtitle", e.target.value)} /></label>
                <label>Frase pequeña<input value={settings.home_kicker || ""} onChange={(e) => updateSettings("home_kicker", e.target.value)} /></label>
                <label>Número WhatsApp<input value={settings.phone || ""} onChange={(e) => updateSettings("phone", e.target.value)} /></label>
                <label>Imagen fondo URL<input value={settings.background_url || ""} onChange={(e) => updateSettings("background_url", e.target.value)} /></label>
                <label>Título servicios<input value={settings.services_title || ""} onChange={(e) => updateSettings("services_title", e.target.value)} /></label>
                <label>Título reserva<input value={settings.booking_title || ""} onChange={(e) => updateSettings("booking_title", e.target.value)} /></label>
                <label>Texto reserva<textarea rows="3" value={settings.booking_text || ""} onChange={(e) => updateSettings("booking_text", e.target.value)} /></label>
                <label>Precio domicilio<input type="number" value={settings.home_extra_price || 0} onChange={(e) => updateSettings("home_extra_price", Number(e.target.value))} /></label>
              </div>
            )}

            {tab === "servicios" && (
              <div>
                <div className="adminSubBox"><h3>Añadir servicio</h3><input value={newService.name} onChange={(e) => setNewService({ ...newService, name: e.target.value })} placeholder="Nombre" /><input value={newService.description} onChange={(e) => setNewService({ ...newService, description: e.target.value })} placeholder="Descripción" /><input type="number" value={newService.price} onChange={(e) => setNewService({ ...newService, price: e.target.value })} placeholder="Precio" /><button type="button" className="mainButton" onClick={addService}>Añadir servicio</button></div>
                <div className="adminList">{services.map((service) => <div className="adminItem editable" key={service.id}><input value={service.name || ""} onChange={(e) => updateService(service.id, "name", e.target.value)} /><input value={service.description || ""} onChange={(e) => updateService(service.id, "description", e.target.value)} /><input type="number" value={service.price || 0} onChange={(e) => updateService(service.id, "price", e.target.value)} /><label className="checkLabel"><input type="checkbox" checked={service.active} onChange={(e) => updateService(service.id, "active", e.target.checked)} /> Visible</label><button type="button" onClick={() => deleteService(service.id)}>Borrar</button></div>)}</div>
              </div>
            )}

            {tab === "horarios" && (
              <div>
                <div className="adminSubBox">
                  <h3>Añadir horario esta semana</h3>
                  <input type="date" min={weekStart} max={weekEnd} value={newSlot.schedule_date} onChange={(e) => setNewSlot({ ...newSlot, schedule_date: e.target.value })} />
                  <input type="time" value={newSlot.schedule_time} onChange={(e) => setNewSlot({ ...newSlot, schedule_time: e.target.value })} />
                  <button type="button" className="mainButton" onClick={addCalendarSlot}>Añadir horario</button>
                  <p className="notice">Solo se muestran a los clientes horarios de la semana actual.</p>
                </div>
                <div className="adminList">{schedules.map((schedule) => <div className="adminItem editable" key={schedule.id}><input type="date" min={weekStart} max={weekEnd} value={schedule.schedule_date || ""} onChange={(e) => updateSchedule(schedule.id, "schedule_date", e.target.value)} /><input type="time" value={schedule.schedule_time || ""} onChange={(e) => updateSchedule(schedule.id, "schedule_time", e.target.value)} /><label className="checkLabel"><input type="checkbox" checked={schedule.active} onChange={(e) => updateSchedule(schedule.id, "active", e.target.checked)} /> Visible</label><button type="button" onClick={() => deleteSchedule(schedule.id)}>Borrar</button></div>)}</div>
              </div>
            )}

            {tab === "seguridad" && <div className="adminForm"><label>Contraseña panel admin<input value={settings.admin_password || ""} onChange={(e) => updateSettings("admin_password", e.target.value)} /></label></div>}
          </div>
        )}
      </section>
    </main>
  );
}

function AdminWeekCalendar({ weekDays, schedules, getBookingForSchedule, selectedBooking, setSelectedBooking }) {
  return (
    <div className="adminWeekCalendar">
      {weekDays.map((day) => {
        const daySlots = schedules.filter((slot) => slot.schedule_date === day.dateString).sort(sortByDateTime);
        return (
          <div className="adminCalendarDay" key={day.dateString}>
            <div className="adminCalendarDayHeader"><b>{day.shortName}</b><span>{day.dayNumber}</span></div>
            <div className="adminCalendarSlots">
              {daySlots.length > 0 ? daySlots.map((slot) => {
                const booking = getBookingForSchedule(slot);
                const statusClass = booking ? (booking.status === "Confirmada" ? "confirmed" : "pending") : "free";
                return (
                  <button type="button" key={slot.id} className={`adminCalendarSlot ${statusClass} ${selectedBooking?.id === booking?.id ? "selected" : ""}`} onClick={() => booking ? setSelectedBooking(booking) : setSelectedBooking(null)}>
                    <span>{slot.schedule_time?.slice(0, 5)}</span>
                    <small>{booking ? booking.customer_name : "Libre"}</small>
                  </button>
                );
              }) : <p className="noSlots">Sin horarios</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BookingDetails({ booking, openWhatsapp, confirmBooking, rejectBooking, deleteBooking }) {
  return (
    <div className="bookingDrawer">
      <div className="bookingDrawerHeader"><h3>{booking.customer_name}</h3><span>{booking.status}</span></div>
      <p><b>Contacto:</b> {booking.contact}</p>
      <p><b>Servicio:</b> {booking.service}</p>
      <p><b>Horario:</b> {booking.schedule_label}</p>
      <p><b>Domicilio:</b> {booking.home_service}</p>
      {booking.address && <p><b>Dirección:</b> {booking.address}</p>}
      {booking.note && <p><b>Nota:</b> {booking.note}</p>}
      <p><b>Total:</b> {booking.total}€</p>
      <div className="bookingActions"><button type="button" onClick={() => openWhatsapp(booking)}>Abrir WhatsApp</button><button type="button" onClick={confirmBooking}>Confirmar</button><button type="button" onClick={rejectBooking}>Rechazar y liberar</button><button type="button" className="dangerMini" onClick={deleteBooking}>Borrar</button></div>
    </div>
  );
}
