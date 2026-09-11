// Generated approved cache paths; never accept a command-provided path.
static int allowed_print_path(const char *path) {
 const char *prefix="/data/print-assets/alfred-";
 if(!strncmp(path,prefix,strlen(prefix))) {
  const char *id=path+strlen(prefix);
  if(strlen(id)!=43 || strcmp(id+36,"-v1.pwg")) return 0;
  for(size_t i=0;i<36;i++) {
   if(i==8||i==13||i==18||i==23) { if(id[i]!='-') return 0; }
   else if(!((id[i]>='0'&&id[i]<='9')||(id[i]>='a'&&id[i]<='f'))) return 0;
  }
  return 1;
 }
 const char *paths[] = {"/app/print/test-a4.pwg",
  "/data/print-assets/charizard-v1.pwg",
  "/data/print-assets/lloyd-v1.pwg",
  "/data/print-assets/ninjago-comic-v1.pwg",
  "/data/print-assets/mario-bowser-v1.pwg",
  "/data/print-assets/mario-bruders-v1.pwg",
  "/data/print-assets/mario-toad-v1.pwg",
  "/data/print-assets/mario-koopa-v1.pwg",
  "/data/print-assets/kungfu-panda-v1.pwg",
  "/data/print-assets/pokemon-zeraora-v1.pwg",
  "/data/print-assets/pokemon-azugladis-v1.pwg",
  "/data/print-assets/zelda-link-v1.pwg",
  "/data/print-assets/zelda-master-schwert-v1.pwg",
  "/data/print-assets/ninjago-lloyd-v1.pwg",
  "/data/print-assets/marvel-thanos-v1.pwg",
  "/data/print-assets/jurassic-dinosaurier-v1.pwg",
  "/data/print-assets/jurassic-camp-v1.pwg",
  "/data/print-assets/starwars-duell-v1.pwg",
  "/data/print-assets/starwars-klon-v1.pwg",
  "/data/print-assets/lego-piraten-v1.pwg",
  "/data/print-assets/ninjago-mech-v1.pwg",
  "/data/print-assets/ninjago-flugzeug-v1.pwg",
  "/data/print-assets/ninjago-drache-v1.pwg",
  "/data/print-assets/ninjago-airjitzu-v1.pwg",
  "/data/print-assets/ninjago-buggy-v1.pwg",
  "/data/print-assets/ninjago-tempel-v1.pwg",
  "/data/print-assets/ninjago-acidicus-v1.pwg",
  "/data/print-assets/ninjago-cole-v1.pwg",
  "/data/print-assets/ninjago-lasha-v1.pwg",
  "/data/print-assets/ninjago-lloyd-speer-v1.pwg",
  "/data/print-assets/ninjago-lloyd-zx-v1.pwg",
  "/data/print-assets/ninjago-team-v1.pwg",
  "/data/print-assets/ninjago-pythor-v1.pwg",
  "/data/print-assets/ninjago-wu-v1.pwg",
  "/data/print-assets/ninjago-spitta-v1.pwg",
  "/data/print-assets/starwars-jedi-v1.pwg",
  "/data/print-assets/pokemon-mega-turtok-v1.pwg",
  "/data/print-assets/pokemon-miraidon-v1.pwg",
  "/data/print-assets/ninjago-lloyd-sterne-v1.pwg",
  "/data/print-assets/ninjago-kai-v1.pwg",
  "/data/print-assets/pokemon-glurak-sport-v1.pwg",
  "/data/print-assets/pokemon-deoxys-v1.pwg",
  "/data/print-assets/pokemon-legendaere-v1.pwg",
  "/data/print-assets/pokemon-tera-kugel-v1.pwg",
  "/data/print-assets/pokemon-paldea-v1.pwg",
  "/data/print-assets/jurassic-lego-v1.pwg",
  "/data/print-assets/minecraft-enderdrache-v1.pwg",
  "/data/print-assets/zelda-wald-v1.pwg",
  "/data/print-assets/zelda-schild-v1.pwg",
  "/data/print-assets/pokemon-terapagos-v1.pwg",
  "/data/print-assets/minecraft-warden-v1.pwg",
  "/data/print-assets/pokemon-lucario-v1.pwg",
  "/data/print-assets/pokemon-knakrack-v1.pwg",
  "/data/print-assets/pokemon-glurak-v1.pwg",
  "/data/print-assets/pokemon-lapras-v1.pwg",
  "/data/print-assets/pokemon-vulpix-v1.pwg",
  "/data/print-assets/pokemon-feelinara-v1.pwg"};
 for (size_t i=0;i<sizeof(paths)/sizeof(paths[0]);i++) if (!strcmp(path,paths[i])) return 1;
 return 0;
}
