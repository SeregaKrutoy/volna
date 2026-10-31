// Жанровая таксономия, привязанная к реальным жанровым чартам Hitmos (/genre/<id>).
// Классификатор определяет жанр трека по исполнителю и названию (RU/EN ключевые слова).

export type GenreInfo = {
  slug: string;
  name: string;
  hitmosId: string;
  keywords: string[];
};

export const GENRES: GenreInfo[] = [
  { slug: "russian-rap", name: "Русский рэп", hitmosId: "7136292", keywords: ["русский рэп", "рэп", "мияги", "miyagi", "эндшпиль", "гуф", "guf", "ноггано", "скриптонит", "моргенштерн", "og buda", "mayot", "big baby tape", "кизару", "obladaet", "markul", "oxxxymiron", "оксимирон", "каспийский груз", "триагрутрика", "the limba", "jony", "джони", "macan", "макан", "instasamka", "егор крид", "крид", "элджей", "feduk", "федук", "toxi", "токи", "bushido zho", "scally milano", "163onmyneck", "friendo", "5opka", "кишлак", "soda luv", "may wave$", "jeembo", "tveth", "pharaoh", "фараон", "t-fest", "lizer", "pyrokinesis", "мукка", "дора", "мэйби бэйби", "frendzona", "soda", "sqwoz bab", "avg", "ugg", "ally", "heroine", "greenwood", "kizaru", "smoke mo", "смоки мо", "madk1d", "villian", "aarne", "toxis"] },
  { slug: "hip-hop", name: "Хип-хоп", hitmosId: "7142171", keywords: ["hip-hop", "hip hop", "хип-хоп", "trap soul", "boom bap", "бум бэп", "old school hip", "андеграунд", "underground hip"] },
  { slug: "trap", name: "Трэп", hitmosId: "7137321", keywords: ["trap", "трэп", "drill", "дрилл", "rage", "plug", "opium", "destroy lonely", "yeat", "playboi carti", "ken carson", "lancey foux", "yeat", "septembersrich"] },
  { slug: "foreign-rap", name: "Зарубежный рэп", hitmosId: "7136291", keywords: ["eminem", "drake", "kendrick", "kanye", "travis scott", "21 savage", "lil baby", "future", "metro boomin", "post malone", "juice wrld", "xxxtentacion", "pop smoke", "central cee", "dave", "stormzy", "doja cat", "nicki minaj", "cardi b", "lil uzi", "trippie redd", "megan thee stallion"] },
  { slug: "phonk", name: "Фонк", hitmosId: "7137321", keywords: ["phonk", "фонк", "drift phonk", "aggressive phonk", "night drive", "kaito shoma", "ghostface playa", "pharmacist", "kordhell", "freddie dredd", "liveevil", "dxrk"] },
  { slug: "russian-pop", name: "Русская поп-музыка", hitmosId: "7136295", keywords: ["анна асти", "асти", "zivert", "зиверт", "niletto", "нилетто", "клава кока", "мари краймбрери", "лобода", "loboda", "полина гагарина", "дима билан", "билан", "сергей лазарев", "лазарев", "нюша", "винтаж", "руки вверх", "звери", "мумий тролль", "ленинград", "шнуров", "монеточка", "гречка", "алёна швец", "polnalubvi", "три дня дождя", "пошлая молли", "кис-кис", "нервы", "порнофильмы", "lumen", "люмен", "уматурман", "uma2rman", "город 312", "serebro", "artik", "артик", "hammali", "navai", "хамали", "наваи", "dabro", "дабро", "гаязовы", "леонид руденко", "артём пивоваров", "пивоваров", "ivan dorn", "дорн", "елка", "ёлка", "макс барских", "ivan valeev", "rave", "хабиб", "каспий? no"] },
  { slug: "foreign-pop", name: "Зарубежная поп-музыка", hitmosId: "7136280", keywords: ["taylor swift", "billie eilish", "dua lipa", "ariana grande", "the weeknd", "ed sheeran", "harry styles", "olivia rodrigo", "sabrina carpenter", "charli xcx", "chappell roan", "gracie abrams", "tate mcrae", "shawn mendes", "justin bieber", "rihanna", "beyonce", "lady gaga", "bruno mars", "sia", "adele", "sam smith", "coldplay", "imagine dragons", "maroon 5", "bts", "blackpink", "stray kids", "newjeans", "jung kook", "miley cyrus", "halsey", "ava max", "bebe rexha", "ellie goulding", "zedd", "calvin harris", "david guetta", "alan walker", "marshmello", "avicii", "kygo", "katy perry"] },
  { slug: "indie-pop", name: "Инди-поп", hitmosId: "7136272", keywords: ["indie pop", "инди-поп", "инди поп", "clairo", "beabadoobee", "girl in red", "rex orange county", "wallows", "cavetown", "mitski", "phoebe bridgers", "boygenius", "alvvays", "men i trust", "mac demarco", "tame impala", "glass animals"] },
  { slug: "dance", name: "Танцевальная музыка", hitmosId: "7137467", keywords: ["танцевальная", "дэнс", "eurodance", "евродэнс", "hands up", "happy hardcore", "бьянка", "scooter", "cascada", "basshunter", "alice deejay", "vengaboys", "aqua", "eiffel 65", "haddaway", "dr alban", "corona", "la bouche", "fun factory", "culture beat", "2 unlimited"] },
  { slug: "club", name: "Клубная музыка", hitmosId: "7137460", keywords: ["клубная", "клубный", "club mix", "big room", "festival", "tiesto", "afrojack", "hardwell", "dimitri vegas", "r3hab", "timmy trumpet", "showtek", "blasterjaxx", "kshmr", "don diablo", "oliver heldens", "tchami", "fisher", "chris lake", "dom dolla", "john summit", "meduza", "amalie lens", "charlotte de witte", "going deeper", "matisse", "sadko", "arston", "malaa", "deorro"] },
  { slug: "house", name: "Хаус", hitmosId: "7136268", keywords: ["house", "хаус", "deep house", "дип-хаус", "tech house", "future house", "bass house", "tropical house", "french house", "daft punk", "justice", "disclosure", "kaytranada", "bob sinclar", "claptone", "purple disco machine", "gorgon city", "camelphat", "solomun", "black coffee", "keinemusik", "adam port", "bicep", "overmono", "four tet", "jamie xx", "aluna", "hayden james", "rufus du sol", "lane 8", "yotto", "ben bohmer", "monolink", "jan blomqvist", "who made who", "joris voorn", "kolsch", "fjaak", "salute", "joy orbison", "channel tres"] },
  { slug: "techno", name: "Техно", hitmosId: "7200620", keywords: ["techno", "техно", "melodic techno", "peak time", "hard techno", "industrial techno", "acid techno", "detroit techno", "dub techno", "minimal techno", "минимал", "amelie lens", "charlotte de witte", "999999999", "i hate models", "kobosil", "reinier zonneveld", "deborah de luca", "nico moreno", "artbat", "tale of us", "anyma", "afterlife", "adriatique", "massano", "layton giordani", "space 92", "maddix", "alignment", "farrago", "oscar mulero", "helena hauff", "dvs1", "ben klock", "marcel dettmann", "jeff mills", "robert hood", "surgeon", "blawan", "karenn", "lotic", "skee mask", "batu", "special request"] },
  { slug: "trance", name: "Транс", hitmosId: "7136269", keywords: ["trance", "транс", "uplifting", "psytrance", "psy trance", "goa", "armin van buuren", "above & beyond", "andrew rayel", "dash berlin", "atb", "cosmic gate", "aly & fila", "ferry corsten", "paul van dyk", "gareth emery", "marlo", "solarstone", "gouryella", "rank 1", "oceanlab", "anjunabeats", "anjunadeep", "enhanced", "astrix", "infected mushroom", "vini vici", "skazi", "berg", "neelix", "liquid soul", "ace ventura", "ritmo", "outsiders", "freedom fighters"] },
  { slug: "dnb", name: "Драм-н-бейс", hitmosId: "7136270", keywords: ["drum and bass", "drum'n'bass", "dnb", "драм", "днб", "liquid", "neurofunk", "jump up", "halftime", "pendulum", "netsky", "hospital records", "camo & krooked", "dimension", "sub focus", "wilkinson", "culture shock", "1991", "grafix", "bcee", "calibre", "alix perez", "friction", "kanine", "bou", "mefjus", "noisia", "the upbeats", "billain", "andy c", "hazard", "taxman", "ram records", "shogun audio", "critical music"] },
  { slug: "dubstep", name: "Дабстеп", hitmosId: "7136267", keywords: ["dubstep", "дабстеп", "brostep", "riddim", "tearout", "deep dubstep", "skrillex", "excision", "svdden death", "marauda", "sullivan king", "wooli", "virtual riot", "must die", "snails", "zomboy", "flux pavilion", "nero", "modestep", "chase & status", "doctor p", "cookie monsta", "funtcase", "dion timmer", "infekt", "blanke", "spag heddy", "peakaboo", "griz", "big gigantic", "liquid stranger", "lsdream", "detox unit", "smith", "bossfight", "muerte"] },
  { slug: "electro", name: "Электроника", hitmosId: "7258376", keywords: ["electro", "электро", "synthwave", "синтвейв", "retrowave", "outrun", "darksynth", "chillwave", "vaporwave", "carpenter brut", "perturbator", "gunship", "the midnight", "fm-84", "timecop1983", "kavinsky", "com truise", "blank banshee", "daniel deluxe", "dance with the dead", "gosht", "mega drive", "power glove", "lectric dragon", "kalax", "tycho", "boards of canada", "bonobo", "thievery corporation", "nightmares on wax", "dj shadow", "flying lotus", "washed out", "neon indian", "toro y moi", "home", "hotel pools", "macintosh plus", "vhs", "bonobo", "rjd2"] },
  { slug: "chillout", name: "Чилл-аут", hitmosId: "7141591", keywords: ["chillout", "чилл-аут", "chill", "чилл", "lofi", "lo-fi", "лофай", "lounge", "лаунж", "relax", "релакс", "calm", "спокойн", "study beats", "beats to relax", "chillhop", "lofi girl", "jazzhop", "sleepy fish", "kupla", "jinsang", "nujabes", "tomppabeats", "j dilla", "madlib", "chester watson", "saba", "smino", "daniel caesar", "brent faiyaz", "lucky daye", "tyla", "rema", "wizkid", "burna boy", "tems", "jhene aiko", "summer walker", "coffee", "кофе", "rain", "дождь", "night", "вечер"] },
  { slug: "ambient", name: "Эмбиент", hitmosId: "7200439", keywords: ["ambient", "эмбиент", "drone", "дрон", "soundscape", "meditation", "медитац", "yoga", "йога", "sleep", "сон", "brian eno", "stars of the lid", "william basinski", "tim hecker", "loscil", "biosphere", "eluvium", "hammock", "lowercase noises", "message to bears", "arms and sleepers", "marine eyes", "field recording", "полевые записи"] },
  { slug: "lounge", name: "Лаунж", hitmosId: "7139491", keywords: ["lounge", "лаунж", "bossa nova", "босса нова", "chill out", "cafe del mar", "buddha bar", "hotel costes", "zero 7", "morcheeba", "hooverphonic", "goldfrapp", "portishead", "massive attack", "sneaker pimps", "lamb", "olive", "mono", "alpha", "beth gibbons", "tricky", "martina topley", "unfinished sympathy"] },
  { slug: "jazz", name: "Джаз", hitmosId: "7142327", keywords: ["jazz", "джаз", "bebop", "бибоп", "swing", "свинг", "smooth jazz", "miles davis", "john coltrane", "bill evans", "chet baker", "dave brubeck", "thelonious monk", "charles mingus", "ella fitzgerald", "nina simone", "billie holiday", "louis armstrong", "duke ellington", "oscar peterson", "diana krall", "norah jones", "melody gardot", "jamie cullum", "michael buble", "kamasi washington", "robert glasper", "esperanza spalding", "tigran hamasyan", "avishai cohen", "hiromi", "snarky puppy", "vulfpeck", "cory wong", "tom misch", "jordan rakei", "khruangbin", "badbadnotgood", "yussef dayes", "alfa mist", "kokoroko", "nubya garcia", "shabaka", "joe armon-jones", "mansur brown", "oscar jerome", "ezra collective", "theo croker", "poppy", "clementine"] },
  { slug: "soul", name: "Соул", hitmosId: "7142174", keywords: ["soul", "соул", "neo soul", "нео-соул", "funk", "фанк", "motown", "stevie wonder", "marvin gaye", "aretha franklin", "james brown", "otis redding", "al green", "curtis mayfield", "isaac hayes", "barry white", "earth wind", "kool & the gang", "chic", "nile rodgers", "prince", "michael jackson", "usher", "d'angelo", "erykah badu", "lauryn hill", "maxwell", "john legend", "alicia keys", "india arie", "jill scott", "raphael saadiq", "the roots", "mos def", "talib kweli", "common", "a tribe called quest", "de la soul"] },
  { slug: "rnb", name: "R&B", hitmosId: "7142172", keywords: ["r&b", "rnb", "рнб", "rhythm and blues", "new jack swing", "sza", "frank ocean", "giveon", "6lack", "partynextdoor", "majid jordan", "sir", "arilennox", "kehlani", "tinashe", "normani", "coco jones", "muni long", "flo", "estelle", "chloe", "halle"] },
  { slug: "acoustic", name: "Акустика", hitmosId: "7136281", keywords: ["acoustic", "акустик", "unplugged", "анплагд", "гитара", "guitar", "fingerstyle", "бард", "авторская песня", "высоцкий", "окуджава", "визбор", "митяев", "розенбаум", "шуфутинский", "круг", "михаил круг", "наговицын", "трофим", "бутырка", "воровайки", "лесоповал", "ирина круг", "стас михайлов", "григорий лепс", "лепс", "меладзе", "брежнева"] },
  { slug: "avtorskaya", name: "Авторская песня", hitmosId: "7136375", keywords: ["авторская", "бардовская", "у костра", "туристская песня", "студенческая песня", "дворовая песня", "городской романс"] },
  { slug: "russian-rock", name: "Русский рок", hitmosId: "7136294", keywords: ["русский рок", "кино", "цой", "виктор цой", "аквариум", "гребенщиков", "ддт", "шевчук", "алиса", "кинчев", "наутилус", "бутусов", "чайф", "агата кристи", "смысловые галлюцинации", "чичерина", "земфира", "сплин", "би-2", "ночные снайперы", "арбенина", "пилот", "король и шут", "киш", "горшенев", "князев", "эпидемия", "ария", "кипелов", "пикник", "крематорий", "калинов мост", "аукцыон", "гражданская оборона", "летов", "егор летов", "сектор газа", "ленинград", "шнур", "animal джаз", "stigmata", "amatory", "слот", "louna", "лоуна", "the hatters", "шляпники", "little big", "план ломоносова", "йорш", "порнофильмы", "нервы", "операция пластилин"] },
  { slug: "foreign-rock", name: "Зарубежный рок", hitmosId: "7136265", keywords: ["linkin park", "metallica", "nirvana", "queen", "pink floyd", "led zeppelin", "ac/dc", "guns n roses", "bon jovi", "aerosmith", "u2", "radiohead", "coldplay", "muse", "arctic monkeys", "the strokes", "the killers", "kings of leon", "foo fighters", "red hot chili", "rhcp", "green day", "blink-182", "sum 41", "the offspring", "limp bizkit", "korn", "slipknot", "system of a down", "soad", "rammstein", "nightwish", "within temptation", "evanescence", "30 seconds to mars", "fall out boy", "panic! at the disco", "my chemical romance", "paramore", "bring me the horizon", "bmth", "sleep token", "bad omens", "architects", "bullet for my valentine", "avenged sevenfold", "disturbed", "shinedown", "three days grace", "breaking benjamin", "nickelback", "alter bridge", "ozzy", "black sabbath", "deep purple", "dio", "judas priest", "iron maiden", "motorhead", "scorpions", "def leppard", "survivor", "journey", "toto", "eagles", "fleetwood mac", "the doors", "creedence", "the who", "the rolling stones", "david bowie", "bruce springsteen", "bob dylan", "neil young", "tom petty"] },
  { slug: "metal", name: "Метал", hitmosId: "7136275", keywords: ["metal", "метал", "heavy metal", "хэви", "thrash", "трэш", "death metal", "дэт", "black metal", "блэк", "doom", "дум", "power metal", "пауэр", "symphonic metal", "folk metal", "viking", "megadeth", "slayer", "anthrax", "pantera", "lamb of god", "machine head", "trivium", "as i lay dying", "children of bodom", "amon amarth", "eluvietie", "korpiklaani", "finntroll", "alestorm", "gloryhammer", "wind rose", "sabaton", "powerwolf", "hammerfall", "helloween", "blind guardian", "stratovarius", "sonata arctica", "epica", "delain", "xandria", "sirenia", "draconian", "swallow the sun", "insomnium", "katatonia", "opeth", "anathema", "my dying bride", "paradise lost", "tiamat", "moonspell", "septicflesh", "fleshgod apocalypse", "dimmu borgir", "emperor", "immortal", "darkthrone", "mayhem", "burzum", "bathory", "venom", "sodom", "kreator", "destruction", "testament", "death", "cannibal corpse", "suffocation", "nile", "dying fetus", "cattle decapitation", "the black dahlia murder", "whitechapel", "thy art is murder", "carnifex", "oceano", "archspire", "obscura", "ulcerate", "carcass", "napalm death", "bolt thrower", "asphyx", "autopsy", "entombed", "amorphis", "ensiferum", "wintersun", "kalmah", "mors principium est", "callisto", "cult of luna", "neurosis", "isis", "pelican", "russian circles", "mono", "envy", "toe", "jizue", "quasimode", "soild", "nabowa"] },
  { slug: "punk", name: "Панк-рок", hitmosId: "7139465", keywords: ["punk", "панк", "pop punk", "поп-панк", "skate punk", "hardcore punk", "street punk", "ramones", "sex pistols", "the clash", "buzzcocks", "dead kennedys", "black flag", "bad brains", "minor threat", "fugazi", "nofx", "bad religion", "pennywise", "lagwagon", "millencolin", "face to face", "alkaline trio", "rise against", "anti-flag", "rancid", "the distillers", "new found glory", "saves the day", "taking back sunday", "brand new", "thursday", "thrice", "glassjaw", "refused", "at the drive-in", "the mars volta", "alexisonfire", "silverstein", "saosin", "circa survive", "the fall of troy", "protest the hero", "dance gavin dance", "hail the sun", "a lot like birds"] },
  { slug: "alternative", name: "Альтернатива", hitmosId: "7136273", keywords: ["alternative", "альтернатива", "alt-rock", "indie rock", "инди-рок", "post-punk", "пост-панк", "new wave", "новая волна", "shoegaze", "шугейз", "dreampop", "дрим-поп", "molchat doma", "молчат дома", "ploho", "плохо", "буерак", "сироткин", "перемотка", "cage the elephant", "the black keys", "the white stripes", "jack white", "fontaines d.c.", "idles", "shame", "squid", "black midi", "black country new road", "dry cleaning", "wet leg", "yard act", "porridge radio", "the murder capital", "gilla band", "whispering sons", "lebanon hanover", "she past away", "just mustard"] },
  { slug: "disco", name: "Диско", hitmosId: "7137902", keywords: ["disco", "диско", "nu-disco", "nu disco", "space disco", "cosmic disco", "abba", "bee gees", "donna summer", "giorgio moroder", "boney m", "modern talking", "dieter bohlen", "c.c. catch", "bad boys blue", "fancy", "savage", "ken laszlo", "baltimora", "sabrina", "samantha fox", "sandra", "michael cretu", "enigma", "jean-michel jarre", "vangelis", "tangerine dream", "kraftwerk", "depeche mode", "new order", "pet shop boys", "erasure", "a-ha", "duran duran", "spandau ballet", "tears for fears", "gary numan", "the human league", "heaven 17", "talk talk", "roxy music", "bryan ferry", "iggy pop", "lou reed", "velvet underground", "patti smith", "television", "talking heads", "blondie", "the cars", "the b-52s", "devo", "yazoo", "eurhythmics", "wham", "george michael", "rick astley", "kylie minogue", "bananarama", "culture club", "boy george", "madonna"] },
  { slug: "italo-disco", name: "Итало-диско", hitmosId: "7137947", keywords: ["italo", "итало", "mike mareen", "den harrow", "albert one", "brian ice", "fred ventura", "radiorama", "p. lion", "linda jo rifai"] },
  { slug: "eurodance", name: "Евродэнс", hitmosId: "7140365", keywords: ["eurodance", "евродэнс", "e-type", "snap!", "masterboy", "e-rotic", "blumchen", "groove coverage", "ian van dahl", "lasgo", "milk inc", "sylver", "danzel", "benny benassi", "satisfaction", "supermode", "axwell", "eric prydz", "call on me", "pjanoo", "swedish house mafia", "avicii", "levels", "wake me up", "hey brother", "the nights", "alesso", "heroes", "otto knows", "million voices"] },
  { slug: "kpop", name: "K-pop", hitmosId: "7140364", keywords: ["k-pop", "kpop", "к-поп", "кейпоп", "bts", "blackpink", "stray kids", "txt", "tomorrow x together", "enhypen", "seventeen", "nct", "aespa", "ive", "le sserafim", "newjeans", "itzy", "twice", "red velvet", "gidle", "ateez", "monsta x", "got7", "exo", "shinee", "bigbang", "2ne1", "iu", "taeyeon", "sunmi", "chungha", "heize", "akmu", "day6", "j-hope", "jimin", "jungkook", "jennie", "lisa", "rose", "jisoo", "ado", "dreamcatcher", "loona", "everglow", "stayc", "nmixx", "kep1er"] },
  { slug: "anime", name: "Аниме-музыка", hitmosId: "7141592", keywords: ["anime", "аниме", "opening", "опенинг", "ending", "эндинг", "yoasobi", "kenshi yonezu", "yorushika", "radwimps", "eve", "aimer", "hiroyuki sawano", "sawano", "yuki kajiura", "joe hisaishi", "ghibli", "one piece", "naruto", "bleach", "attack on titan", "demon slayer", "jujutsu kaisen", "chainsaw man", "spy x family", "my hero academia", "tokyo revengers", "death note", "fullmetal alchemist", "cowboy bebop", "samurai champloo", "asian kung-fu generation", "coldrain", "man with a mission", "king gnu", "vaundy", "fujii kaze", "zutomayo", "tuyu", "vocaloid", "hatsune miku", "kagamine", "megurine luka", "deco*27", "maretu", "syudou", "kanaria", "inabakumori", "kemu", "wowaka", "honeyworks", "ado", "eve"] },
  { slug: "classical", name: "Классика", hitmosId: "7136266", keywords: ["classical", "классика", "классическая", "symphony", "симфония", "concerto", "концерт", "sonata", "соната", "nocturne", "ноктюрн", "waltz", "вальс", "etude", "этюд", "prelude", "прелюдия", "fugue", "фуга", "opera", "опера", "ballet", "балет", "bach", "бах", "mozart", "моцарт", "beethoven", "бетховен", "chopin", "шопен", "tchaikovsky", "чайковский", "rachmaninoff", "рахманинов", "debussy", "ravel", "satie", "сати", "vivaldi", "вивальди", "handel", "гендель", "haydn", "гайдн", "schubert", "шуберт", "schumann", "шуман", "brahms", "брамс", "liszt", "лист", "wagner", "вагнер", "verdi", "верди", "puccini", "пуччини", "bizet", "бизе", "mussorgsky", "мусоргский", "borodin", "бородин", "rimsky-korsakov", "римский-корсаков", "stravinsky", "стравинский", "prokofiev", "прокофьев", "shostakovich", "шостакович", "mahler", "малер", "sibelius", "сибелиус", "grieg", "григ", "dvorak", "дворжак", "smetana", "сметана", "elgar", "holst", "britten", "barber", "gershwin", "glass", "philip glass", "reich", "arvo part", "пярт", "richter", "max richter", "olafur arnalds", "nils frahm", "hauschka", "joep beving", "ludovico einaudi", "эйнауди", "yiruma", "ирума", "yann tiersen", "тирсен", "comptine", "nuvole bianche", "una mattina", "fly", "primavera", "experience", "seven days walking", "petricor"] },
  { slug: "instrumental", name: "Инструментальная", hitmosId: "7136271", keywords: ["instrumental", "инструментал", "без слов", "no vocals", "fingerstyle", "piano solo", "guitar solo", "lofi beats", "study beats", "focus music", "deep focus", "учёба", "концентрация", "фоновая музыка"] },
  { slug: "soviet", name: "Советская эстрада", hitmosId: "7136374", keywords: ["советская", "ретро", "пугачёва", "алла пугачёва", "леонтьев", "кобзон", "магомаев", "муслим магомаев", "хиль", "эдуард хиль", "кристалинская", "пьеха", "эдита пьеха", "сенчина", "толкунова", "самоцветы", "пламя", "лейся песня", "весёлые ребята", "песняры", "ариэль", "цветы", "стас намин", "машина времени", "макаревич", "воскресение", "автограф", "диалог", "зякина"] },
  { slug: "chanson", name: "Шансон", hitmosId: "7136293", keywords: ["шансон", "михаил круг", "наговицын", "сергей наговицын", "жека", "трофимов", "сергей трофимов", "розенбаум", "александр розенбаум", "шуфутинский", "михаил шуфутинский", "бутырка", "воровайки", "лесоповал", "леспромхоз", "ирина круг", "другая река", "владимир асмолов", "михаил шелег", "ефрем амирамов", "вилли токарев", "любовь успенская", "зара", "тамара гвердцители", "лариса долина", "александр малинин", "олег газманов", "браво", "жанна агузарова"] },
  { slug: "country", name: "Кантри", hitmosId: "7137324", keywords: ["country", "кантри", "bluegrass", "блюграсс", "americana", "folk", "фолк", "johnny cash", "джонни кэш", "dolly parton", "долли партон", "willie nelson", "hank williams", "loretta lynn", "gillian welch", "alison krauss", "nickel creek", "punch brothers", "chris thile", "bela fleck", "sarah jarosz", "mumford & sons", "the lumineers", "of monsters and men", "vance joy", "george ezra", "hozier", "noah kahan", "zach bryan", "tyler childers", "sierra ferrell", "billy strings", "charley crockett", "sturgill simpson", "chris stapleton", "kacey musgraves", "miranda lambert", "carrie underwood", "blake shelton", "keith urban", "brad paisley", "eric church", "dan + shay", "old dominion", "rascal flatts", "reba", "tanya tucker", "tammy wynette", "patsy cline", "conway twitty", "merle haggard", "buck owens", "dwight yoakam", "george strait", "alan jackson", "randy travis", "vince gill", "trisha yearwood", "faith hill", "tim mcgraw", "shania twain", "garth brooks", "brooks & dunn"] },
  { slug: "reggae", name: "Регги", hitmosId: "7136274", keywords: ["reggae", "регги", "dub", "даб", "dancehall", "дэнсхолл", "ska", "rocksteady", "bob marley", "боб марли", "peter tosh", "jimmy cliff", "toots", "desmond dekker", "lee scratch perry", "king tubby", "scientist", "mad professor", "jah shaka", "dennis brown", "gregory isaacs", "black uhuru", "steel pulse", "third world", "inner circle", "ub40", "shaggy", "sean paul", "beenie man", "vybz kartel", "popcaan", "koffee", "protoje", "chronixx", "damian marley", "ziggy marley", "alborosie", "gentleman", "patrice", "hollie cook", "stick figure", "rebelution", "iration", "j boog", "fiji", "kolohe kai", "common kings", "maoli"] },
  { slug: "blues", name: "Блюз", hitmosId: "7251700", keywords: ["blues", "блюз", "delta blues", "chicago blues", "electric blues", "b.b. king", "muddy waters", "howlin' wolf", "john lee hooker", "robert johnson", "son house", "charley patton", "skip james", "lightnin' hopkins", "albert king", "freddie king", "otis rush", "buddy guy", "johnny winter", "stevie ray vaughan", "eric clapton", "john mayall", "peter green", "gary moore", "rory gallagher", "joe bonamassa", "kenny wayne shepherd", "jonny lang", "derek trucks", "susan tedeschi", "tedeschi trucks band", "the black keys", "dan auerbach", "alabama shakes", "brittany howard", "gary clark jr", "kingfish ingram", "taj mahal", "corey harris"] },
  { slug: "french", name: "Французская музыка", hitmosId: "7136048", keywords: ["french", "французская", "serge gainsbourg", "francoise hardy", "edith piaf", "эдит пиаф", "charles aznavour", "шарль азнавур", "jacques brel", "жак брель", "dalida", "далида", "joe dassin", "джо дассен", "mireille mathieu", "мирей матье", "zaz", "christine and the queens", "angele", "pomme", "clara luciani", "juliette armanet", "benjamin biolay", "sebastien tellier", "m83", "kavinsky", "danger", "cassius", "phoenix", "polo & pan", "bon entendeur", "darius", "kartell"] },
  { slug: "dj-remix", name: "Ремиксы", hitmosId: "7136380", keywords: ["remix", "ремикс", "remixes", "edit", "bootleg", "бутлег", "mashup", "мэшап", "flip", "extended mix", "club mix", "radio edit", "slowed", "sped up", "nightcore", "daycore", "phonk remix", "house remix", "techno remix"] },
  { slug: "car-music", name: "Музыка в авто", hitmosId: "7135787", keywords: ["в авто", "в машину", "bass boosted", "басс", "subwoofer", "сабвуфер", "автозвук", "car music"] },
  { slug: "vocal-trance", name: "Vocal Trance", hitmosId: "7137730", keywords: ["vocal trance", "вокальный транс", "emma hewitt", "lange", "susana", "haliene", "roxanne emery", "christina novelli", "sue mclaren", "ana criado", "betsie larkin", "sarah russell"] },
  { slug: "dream-house", name: "Dream House", hitmosId: "7250635", keywords: ["dream house", "robert miles", "children", "fable", "one and one"] },
  { slug: "hardcore", name: "Хардкор", hitmosId: "7200317", keywords: ["hardcore", "хардкор", "gabber", "габбер", "speedcore", "frenchcore", "uptempo", "industrial hardcore", "angy derksen", "andy the core", "miss k8", "angerfist", "neophyte", "evil activities", "endymion", "tha playah", "masters of hardcore", "dominator", "syndicate"] },
  { slug: "minimal-techno", name: "Минимал-техно", hitmosId: "7200619", keywords: ["minimal", "минимал", "microhouse", "rominimal", "rhadoo", "raresh", "petre inspirescu", "richie hawtin", "plastikman", "john acquaviva", "dubfire", "deepchord", "basic channel", "maurizio", "monolake", "pantha du prince", "the field", "kompakt", "michael mayer", "gui boratto", "the orb", "system 7"] },
  { slug: "rocknroll", name: "Рок-н-ролл", hitmosId: "7200621", keywords: ["rock-n-roll", "рок-н-ролл", "rock'n'roll", "chuck berry", "little richard", "jerry lee lewis", "elvis", "элвис", "buddy holly", "bill haley", "the ventures", "the shadows"] },
  { slug: "italo-disco", name: "Итало-диско", hitmosId: "7137947", keywords: ["italo", "итало", "mike mareen", "den harrow", "albert one", "brian ice", "fred ventura", "radiorama", "p. lion"] },
  { slug: "electropop", name: "Электропоп", hitmosId: "7136282", keywords: ["electropop", "электропоп", "synthpop", "синтпоп", "synth-pop", "chvrches", "purity ring", "grimes", "ladytron", "goldfrapp", "la roux", "florence", "marina", "lorde", "allie x", "foxes", "years & years", "olly alexander", "bright light bright light", "erasure", "yazoo", "soft cell", "propaganda", "frankie goes to hollywood", "dead or alive"] },
];

const GENRE_BY_SLUG = new Map(GENRES.map((g) => [g.slug, g]));

// Настроение (ключи пресетов из API) -> жанры
export const MOOD_GENRES: Record<string, string[]> = {
  chill: ["chillout", "lounge", "ambient", "acoustic"],
  energy: ["dance", "club", "house", "electro", "eurodance", "disco"],
  focus: ["ambient", "classical", "instrumental", "chillout"],
  sad: ["acoustic", "avtorskaya", "soul", "rnb"],
  rap: ["russian-rap", "hip-hop", "trap", "phonk", "foreign-rap"],
  rock: ["russian-rock", "foreign-rock", "alternative", "punk", "metal"],
};

export function getGenre(slug: string): GenreInfo | undefined {
  return GENRE_BY_SLUG.get(slug);
}

export function genreName(slug: string): string {
  return GENRE_BY_SLUG.get(slug)?.name || slug;
}

export function genreHitmosIds(slugs: string[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const slug of slugs) {
    const id = GENRE_BY_SLUG.get(slug)?.hitmosId;
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function normalizeText(value: string): string {
  return (value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s'&-]/gu, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordHit(text: string, keyword: string): boolean {
  const kw = normalizeText(keyword.trim());
  if (!kw || kw === "no" || kw.endsWith("? no")) return false;
  if (kw.length <= 4) {
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(kw)}([^\\p{L}\\p{N}]|$)`, "iu").test(text);
  }
  return text.includes(kw);
}

/** Определяет до 2 жанров трека по исполнителю и названию. */
export function classifyGenres(artist: string, title: string): string[] {
  const text = normalizeText(`${artist} ${title}`);
  if (!text.trim()) return [];
  const scored: { slug: string; hits: number }[] = [];
  for (const genre of GENRES) {
    if (!genre.keywords.length) continue;
    let hits = 0;
    for (const kw of genre.keywords) {
      if (keywordHit(text, kw)) hits++;
    }
    if (hits > 0) scored.push({ slug: genre.slug, hits });
  }
  scored.sort((a, b) => b.hits - a.hits);
  return scored.slice(0, 2).map((s) => s.slug);
}

/** Язык трека: ru | en | mix | instrumental */
export function detectLanguage(artist: string, title: string): "ru" | "en" | "mix" | "instrumental" {
  const text = `${artist} ${title}`.toLowerCase().replace(/ё/g, "е");
  if (/инструментал|без слов|instrumental|no vocals|fingerstyle|piano solo/.test(text)) return "instrumental";
  const cyr = (text.match(/[а-я]/g) || []).length;
  const lat = (text.match(/[a-z]/g) || []).length;
  if (cyr === 0 && lat === 0) return "mix";
  if (cyr > 0 && lat === 0) return "ru";
  if (lat > 0 && cyr === 0) return "en";
  return cyr >= lat * 0.5 ? "ru" : "mix";
}

/** Версионные теги в названии: cover, remix, acoustic, live, slowed... */
export function detectVersionTags(title: string): string[] {
  const text = normalizeText(title);
  const tags: string[] = [];
  if (/cover|кавер/.test(text)) tags.push("cover");
  if (/remix|ремикс|rmx|edit|bootleg|flip|mashup/.test(text)) tags.push("remix");
  if (/acoustic|акустик|unplugged/.test(text)) tags.push("acoustic");
  if (/\blive\b|лайв|концерт/.test(text)) tags.push("live");
  if (/slowed|sped up|nightcore|daycore/.test(text)) tags.push("slowed");
  if (/phonk|фонк/.test(text)) tags.push("phonk");
  return tags;
}

const MOOD_LEXICONS: Record<string, string[]> = {
  calm: ["chill", "чилл", "lounge", "лаунж", "relax", "релакс", "lofi", "lo-fi", "лофай", "ambient", "эмбиент", "calm", "спокойн", "dream", "сон", "rain", "дождь", "piano", "пианино", "study", "учёба", "sleep", "вечер", "coffee", "кофе", "jazz", "джаз"],
  energy: ["dance", "танцевальн", "club", "клубн", "energy", "энергич", "драйв", "drive", "party", "вечеринка", "workout", "спорт", "бег", "run", "fitness", "фитнес", "electro", "techno", "hard", "rave", "рейв", "festival", "bass", "басс", "jump"],
  sad: ["грустн", "sad", "меланхол", "лирик", "lonely", "одинок", "broken", "pain", "боль", "tears", "слез", "sorry", "прости", "goodbye", "прощай", "miss you", "скучаю", "alone", "один", "night", "ночь"],
  focus: ["piano", "пианино", "focus", "фокус", "classic", "классика", "instrumental", "инструментал", "study", "учёба", "work", "работа", "ambient", "concentration", "концентрация", "neoclassic", "неоклассика", "minimal", "минимал"],
};

/** Настроенческий профиль трека: calm / energy / sad / focus со счётом совпадений. */
export function detectMoods(artist: string, title: string): Record<string, number> {
  const text = normalizeText(`${artist} ${title}`);
  const result: Record<string, number> = { calm: 0, energy: 0, sad: 0, focus: 0 };
  for (const [mood, words] of Object.entries(MOOD_LEXICONS)) {
    for (const word of words) {
      if (text.includes(word)) result[mood]++;
    }
  }
  return result;
}
