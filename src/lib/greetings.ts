const GREETINGS = [
  { title: "Привет! Отличное время для музыки", subtitle: "Включайте любимые треки и открывайте новое." },
  { title: "Снова здравствуйте, меломан", subtitle: "Ваши плейлисты ждут — можно слушать." },
  { title: "Музыкальный привет вам", subtitle: "Найдите трек под настроение." },
  { title: "Доброго звука", subtitle: "Отличный день, чтобы услышать что-то новое." },
  { title: "Привет, слушатель", subtitle: "Погрузитесь в мир звуков — прямо сейчас." },
  { title: "Рады снова вас слышать", subtitle: "Ваши треки собраны здесь." },
  { title: "Хорошего музыкального дня", subtitle: "Энергия звука с вами." },
  { title: "Привет, музыкальный исследователь", subtitle: "Открывайте новые жанры каждый день." },
  { title: "Здравствуйте, меломан", subtitle: "Музыка звучит лучше вместе с вами." },
  { title: "С возвращением", subtitle: "Продолжайте с того места, где остановились." },
  { title: "Отличное настроение начинается здесь", subtitle: "Слушайте, что нравится." },
  { title: "Привет, друг музыки", subtitle: "Здесь живёт ваш личный звук." },
  { title: "Добро пожаловать в мир звука", subtitle: "Выбирайте трек под текущее настроение." },
  { title: "Музыкальное утро или вечер", subtitle: "В любом случае — время для треков." },
  { title: "Привет, меломания продолжается", subtitle: "Новые треки ждут вашего прослушивания." },
];

const TIME_GREETINGS = [
  { hour: 5, text: "Доброе утро, меломан", hint: "Отличное время для бодрого звука" },
  { hour: 11, text: "Добрый день, меломан", hint: "Музыка для хорошего настроения" },
  { hour: 17, text: "Добрый вечер, меломан", hint: "Время для расслабленного звука" },
  { hour: 23, text: "Доброй ночи, меломан", hint: "Спокойная музыка под вечерний ритм" },
  { hour: 4, text: "Доброй ночи, меломан", hint: "Тихое прослушивание ночью" },
];

export function getRandomGreeting() {
  return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
}

export function getTimeGreeting(): { text: string; hint: string } {
  const hour = new Date().getHours();
  for (const item of TIME_GREETINGS) {
    if (hour >= item.hour && hour < item.hour + 6) {
      return { text: item.text, hint: item.hint };
    }
  }
  return TIME_GREETINGS[0];
}

/** Комбинация приветствия по времени суток + случайный текст. */
export function getGreeting(): { title: string; subtitle: string } {
  const time = getTimeGreeting();
  const random = getRandomGreeting();
  if (Math.random() < 0.5) {
    return { title: random.title, subtitle: random.subtitle };
  }
  return { title: time.text, subtitle: time.hint };
}
