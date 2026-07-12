import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Search } from "lucide-react";
import type { SpotifyArtistInfo } from "@/lib/music.types";
import { cn } from "@/lib/utils";

interface Props {
  languages: string[];
  selected: SpotifyArtistInfo[];
  onToggle: (artist: SpotifyArtistInfo) => void;
  onBack: () => void;
  onFinish: () => void;
  saving: boolean;
}

const MIN_PICKS = 3;

// Master dataset — music directors / composers by language.
export const ALL_MUSIC_DIRECTORS: Record<string, string[]> = {
  Tamil: [
    "A.R. Rahman", "Ilayaraaja", "Anirudh Ravichander", "Yuvan Shankar Raja",
    "Harris Jayaraj", "G.V. Prakash Kumar", "Santhosh Narayanan", "D. Imman",
    "Vidyasagar", "Deva", "Bharadwaj", "M. S. Viswanathan", "K. V. Mahadevan",
    "Sam C. S.", "Ghibran", "Sean Roldan", "Dhibu Ninan Thomas", "Nivas K. Prasanna",
    "Leon James", "Vivek-Mervin", "Justin Prabhakaran", "Gopi Sundar",
    "Premgi Amaren", "S. A. Rajkumar", "Sirpy", "T. Rajendar", "V. Kumar",
    "Shankar-Ganesh", "Gangai Amaran", "Hiphop Tamizha", "Darbuka Siva",
    "Tenma", "Jakes Bejoy", "Govind Vasantha", "Pradeep Kumar", "Arrol Corelli",
  ],
  Telugu: [
    "M.M. Keeravani", "Devi Sri Prasad", "Thaman S", "Mani Sharma",
    "Koti", "Raj-Koti", "Gopi Sundar", "Mickey J. Meyer", "Radhan",
    "Anup Rubens", "Chaitan Bharadwaj", "Hesham Abdul Wahab", "Bheems Ceciroleo",
    "K. V. Mahadevan", "S. P. Balasubrahmanyam", "Chakri", "Vandemataram Srinivas",
    "Sri", "Kalyan Malik", "Sunny M.R.", "Vivek Sagar", "Sricharan Pakala",
    "G. V. Prakash Kumar", "Mahati Swara Sagar", "Karthik", "S.A. Rajkumar",
  ],
  Hindi: [
    "A.R. Rahman", "Pritam", "Vishal-Shekhar", "Amit Trivedi",
    "Shankar-Ehsaan-Loy", "Sachin-Jigar", "Salim-Sulaiman", "Mithoon",
    "Amaal Mallik", "Tanishk Bagchi", "R.D. Burman", "S.D. Burman",
    "Laxmikant-Pyarelal", "Kalyanji-Anandji", "Naushad", "Madan Mohan",
    "O.P. Nayyar", "Khayyam", "Bappi Lahiri", "Anu Malik", "Nadeem-Shravan",
    "Jatin-Lalit", "Himesh Reshammiya", "Sajid-Wajid", "A. R. Ameen",
    "Clinton Cerejo", "Ram Sampath", "Sohail Sen", "Meet Bros", "Rochak Kohli",
    "B. Praak", "Jaani", "Payal Dev", "Sneha Khanwalkar",
  ],
  Malayalam: [
    "Sushin Shyam", "Gopi Sundar", "Vidyasagar", "M. Jayachandran",
    "Deepak Dev", "Shaan Rahman", "Hesham Abdul Wahab", "Jakes Bejoy",
    "Govind Vasantha", "Rex Vijayan", "Bijibal", "Raveendran",
    "Johnson", "Devarajan", "M. S. Baburaj", "Salil Chowdhury",
    "Ouseppachan", "Mohan Sithara", "Alex Paul", "Alphons Joseph",
    "Rahul Raj", "Prasanth Pillai", "Vishnu Vijay", "Kailas Menon",
    "Ranjin Raj", "Kedar",
  ],
  Kannada: [
    "Arjun Janya", "V. Harikrishna", "Ajaneesh Loknath", "Charan Raj",
    "Ravi Basrur", "Gurukiran", "Mano Murthy", "Hamsalekha",
    "Rajan-Nagendra", "Upendra Kumar", "G. K. Venkatesh", "Sadhu Kokila",
    "Anoop Seelin", "Judah Sandhy", "Vasuki Vaibhav", "Kadri Manikanth",
    "Sridhar V. Sambhram", "J. Anoop Seelin", "Midhun Mukundan",
  ],
};

function slugId(name: string) {
  return "md-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function toArtistInfo(name: string): SpotifyArtistInfo {
  return {
    id: slugId(name),
    name,
    hdPhotoUrl: null,
    isVerified: false,
    followers: 0,
    genres: [],
  };
}

const AVATAR_COLORS = [
  "bg-pink-500", "bg-purple-500", "bg-indigo-500",
  "bg-blue-500", "bg-teal-500", "bg-emerald-500",
  "bg-orange-500", "bg-rose-500",
];

function getInitials(name: string) {
  return name ? name.charAt(0).toUpperCase() : "?";
}

function getAvatarColor(name: string) {
  const index = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}


export function ArtistStep({ languages, selected, onToggle, onBack, onFinish, saving }: Props) {
  const availableLanguages = useMemo(() => {
    const all = Object.keys(ALL_MUSIC_DIRECTORS);
    const picked = languages.filter((l) => all.includes(l));
    return picked.length > 0 ? picked : all;
  }, [languages]);

  const [activeLanguage, setActiveLanguage] = useState<string>(availableLanguages[0]);
  const [searchQuery, setSearchQuery] = useState("");

  const displayArtists = useMemo(() => {
    const list = ALL_MUSIC_DIRECTORS[activeLanguage] || [];
    const q = searchQuery.trim().toLowerCase();
    return q ? list.filter((a) => a.toLowerCase().includes(q)) : list;
  }, [activeLanguage, searchQuery]);

  const selectedNames = useMemo(() => new Set(selected.map((s) => s.name)), [selected]);
  const canFinish = selected.length >= MIN_PICKS;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35 }}
      className="mx-auto max-w-3xl pb-32"
    >
      <div className="text-center">
        <h1 className="text-4xl font-bold md:text-5xl">
          Pick artists you <span className="vibe-text">love</span>
        </h1>
        <p className="mt-3 text-white/60">Choose at least {MIN_PICKS} to personalize your Vibtune experience.</p>
      </div>

      {/* Search */}
      <div className="relative mt-8">
        <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
        <input
          type="text"
          placeholder={`Search ${activeLanguage} artists...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-full border border-white/10 bg-neutral-900/70 px-12 py-3 text-white placeholder:text-white/40 focus:border-pink-500 focus:outline-none"
        />
      </div>

      {/* Language tabs */}
      <div className="scrollbar-hide mt-5 flex gap-3 overflow-x-auto pb-2">
        {availableLanguages.map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => { setActiveLanguage(lang); setSearchQuery(""); }}
            className={cn(
              "whitespace-nowrap rounded-full px-5 py-2 text-sm font-medium transition-colors",
              activeLanguage === lang
                ? "bg-white text-black"
                : "bg-neutral-900 text-white/60 hover:bg-neutral-800 hover:text-white",
            )}
          >
            {lang}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="mt-6 grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5">
        {displayArtists.length > 0 ? (
          displayArtists.map((name) => {
            const isSelected = selectedNames.has(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => onToggle(toArtistInfo(name))}
                className="group flex cursor-pointer flex-col items-center gap-2"
              >
                <div
                  className={cn(
                    "relative rounded-full p-1 transition-all",
                    isSelected
                      ? "scale-105 bg-gradient-to-tr from-pink-500 to-purple-500"
                      : "bg-transparent group-hover:bg-white/10",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-20 w-20 items-center justify-center rounded-full text-3xl font-bold text-white shadow-inner",
                      getAvatarColor(name),
                    )}
                  >
                    {getInitials(name)}
                  </div>

                  {isSelected && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                      <Check className="h-8 w-8 text-white" strokeWidth={3} />
                    </div>
                  )}
                </div>
                <p className="line-clamp-2 text-center text-xs font-medium text-white/90">{name}</p>
              </button>
            );
          })
        ) : (
          <div className="col-span-full py-10 text-center text-white/50">No artists found.</div>
        )}
      </div>

      {/* Fixed bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black via-black/90 to-transparent px-6 pb-6 pt-10">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBack}
            className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm text-white/80 hover:text-white"
          >
            Back
          </button>
          <p className="text-sm font-medium">
            <span className={selected.length >= MIN_PICKS ? "text-green-400" : "text-white/50"}>
              {selected.length} / {MIN_PICKS}+ selected
            </span>
          </p>
          <button
            type="button"
            onClick={onFinish}
            disabled={!canFinish || saving}
            className={cn(
              "rounded-full px-8 py-3 text-sm font-bold transition-all",
              canFinish && !saving
                ? "bg-white text-black hover:scale-105"
                : "cursor-not-allowed bg-neutral-800 text-neutral-500",
            )}
          >
            {saving ? "Saving…" : "Enter Vibtune"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
