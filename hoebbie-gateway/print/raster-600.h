/* Convert only our verified single A4 sgray_8 page. CUPS owns PWG encoding.
 * The source checksum is checked by the caller; never modify its cache file. */
#include <cups/raster.h>
#include <cups/pwg.h>
static FILE *a4_raster_600(FILE *source) {
 cups_raster_t *in=NULL,*out=NULL;
 FILE *converted=NULL;
 cups_page_header2_t input,output,extra;
 unsigned char row[2480],scaled[4960];
 int ok=0;
 in=cupsRasterOpen(fileno(source),CUPS_RASTER_READ);
 if(!in||!cupsRasterReadHeader2(in,&input))goto done;
 if(input.cupsWidth!=2480||input.cupsHeight!=3507||input.cupsBytesPerLine!=2480||
    input.cupsBitsPerColor!=8||input.cupsBitsPerPixel!=8||input.cupsNumColors!=1||
    input.cupsColorSpace!=CUPS_CSPACE_SW||input.cupsColorOrder!=CUPS_ORDER_CHUNKED||
    input.HWResolution[0]!=300||input.HWResolution[1]!=300||input.Duplex||input.NumCopies!=1)goto done;
 pwg_media_t *media=pwgMediaForPWG("iso_a4_210x297mm");
 if(!media||!cupsRasterInitPWGHeader(&output,media,"sgray_8",600,600,"one-sided",NULL))goto done;
 output.NumCopies=1;
 if(output.cupsWidth!=4960||output.cupsHeight!=7015||output.cupsBytesPerLine!=4960)goto done;
 converted=tmpfile();if(!converted)goto done;
 out=cupsRasterOpen(fileno(converted),CUPS_RASTER_WRITE_PWG);
 if(!out||!cupsRasterWriteHeader2(out,&output))goto done;
 for(unsigned y=0;y<input.cupsHeight;y++){
  if(cupsRasterReadPixels(in,row,sizeof(row))!=sizeof(row))goto done;
  for(unsigned x=0;x<sizeof(row);x++)scaled[2*x]=scaled[2*x+1]=row[x];
  for(int repeat=0;repeat<2;repeat++)if(cupsRasterWritePixels(out,scaled,sizeof(scaled))!=sizeof(scaled))goto done;
 }
 /* CUPS rounds A4 to 3507 rows at 300 dpi and 7015 at 600 dpi. */
 memset(scaled,255,sizeof(scaled));
 if(cupsRasterWritePixels(out,scaled,sizeof(scaled))!=sizeof(scaled))goto done;
 if(cupsRasterReadHeader2(in,&extra))goto done;
 ok=1;
 done:
 if(in)cupsRasterClose(in);
 if(out)cupsRasterClose(out);
 if(!ok){if(converted)fclose(converted);return NULL;}
 struct stat converted_stat;
 if(fstat(fileno(converted),&converted_stat)||converted_stat.st_size<1800||converted_stat.st_size>48000000||fseek(converted,0,SEEK_SET)){
  fclose(converted);return NULL;
 }
 return converted;
}
