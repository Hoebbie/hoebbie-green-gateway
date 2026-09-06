/* Bounded CUPS client: one request, never a document resubmission loop.
 * Reference: OpenPrinting CUPS 2.4.18 cups/request.c and IPP API. */
#include <cups/cups.h>
#include <cups/http.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

static int integer(ipp_t *r,const char *key,int fallback){
 ipp_attribute_t *a=ippFindAttribute(r,key,IPP_TAG_INTEGER);
 return a?ippGetInteger(a,0):fallback;
}
static int contains(ipp_t *r,const char *key,ipp_tag_t tag,const char *value){
 ipp_attribute_t *a=ippFindAttribute(r,key,tag);
 for(int i=0;a&&i<ippGetCount(a);i++){const char *v=ippGetString(a,i,NULL);if(v&&!strcmp(v,value))return 1;}
 return 0;
}
static int die(void){puts("{\"error\":\"ipp_unconfirmed\"}");return 1;}
int main(int argc,char **argv){
 if(argc!=5)return die();
 const char *op=argv[1],*uri=argv[2],*name=argv[3],*arg=argv[4];
 int submit=!strcmp(op,"submit"),status=!strcmp(op,"status"),cancel=!strcmp(op,"cancel"),check=!strcmp(op,"check");
 if(!(submit||status||cancel||check)||strlen(name)!=40||strncmp(name,"HOS-",4))return die();
 char scheme[16],user[128],host[256],resource[256];int port=0;
 if(httpSeparateURI(HTTP_URI_CODING_ALL,uri,scheme,sizeof(scheme),user,sizeof(user),host,sizeof(host),&port,resource,sizeof(resource))!=HTTP_URI_STATUS_OK||user[0])return die();
 if(strcmp(scheme,"ipp")&&strcmp(scheme,"ipps"))return die();
 http_t *http=httpConnect2(host,port,NULL,AF_UNSPEC,!strcmp(scheme,"ipps")?HTTP_ENCRYPTION_ALWAYS:HTTP_ENCRYPTION_IF_REQUESTED,1,8000,NULL);
 if(!http)return die();
 httpSetTimeout(http,20,NULL,NULL);
 ipp_t *req=ippNewRequest(submit?IPP_OP_PRINT_JOB:status?IPP_OP_GET_JOB_ATTRIBUTES:cancel?IPP_OP_CANCEL_JOB:IPP_OP_GET_PRINTER_ATTRIBUTES);
 ippAddString(req,IPP_TAG_OPERATION,IPP_TAG_URI,"printer-uri",NULL,uri);
 ippAddString(req,IPP_TAG_OPERATION,IPP_TAG_NAME,"requesting-user-name",NULL,"HoebbieOS");
 FILE *file=NULL;struct stat st;size_t length=0;
 if(submit){
  if(strcmp(arg,"/app/print/test-a4.pwg") && strcmp(arg,"/data/print-assets/charizard-v1.pwg") && strcmp(arg,"/data/print-assets/lloyd-v1.pwg") && strcmp(arg,"/data/print-assets/ninjago-comic-v1.pwg") && !getenv("HOEBBIE_PRINT_SIMULATOR")){ippDelete(req);httpClose(http);return die();}
  file=fopen(arg,"rb");if(!file||fstat(fileno(file),&st)||st.st_size<1800||st.st_size>12000000){if(file)fclose(file);ippDelete(req);httpClose(http);return die();}
  ippAddString(req,IPP_TAG_OPERATION,IPP_TAG_NAME,"job-name",NULL,name);
  ippAddString(req,IPP_TAG_OPERATION,IPP_TAG_MIMETYPE,"document-format",NULL,"image/pwg-raster");
  ippAddBoolean(req,IPP_TAG_OPERATION,"ipp-attribute-fidelity",1);
  ippAddString(req,IPP_TAG_JOB,IPP_TAG_KEYWORD,"media",NULL,"iso_a4_210x297mm");
  ippAddString(req,IPP_TAG_JOB,IPP_TAG_KEYWORD,"sides",NULL,"one-sided");
  ippAddString(req,IPP_TAG_JOB,IPP_TAG_KEYWORD,"print-color-mode",NULL,"monochrome");
  ippAddInteger(req,IPP_TAG_JOB,IPP_TAG_INTEGER,"copies",1);
  ippAddResolution(req,IPP_TAG_JOB,"printer-resolution",IPP_RES_PER_INCH,300,300);
  length=(size_t)st.st_size;
 }else if(status||cancel){
  char *end=NULL;long id=strtol(arg,&end,10);
  if(!end||*end||id<1||id>2147483647L){ippDelete(req);httpClose(http);return die();}
  ippAddInteger(req,IPP_TAG_OPERATION,IPP_TAG_INTEGER,"job-id",(int)id);
  if(status){const char *attrs[]={"job-id","job-name","job-state","job-state-reasons","job-media-sheets-completed"};ippAddStrings(req,IPP_TAG_OPERATION,IPP_TAG_KEYWORD,"requested-attributes",5,NULL,attrs);}
 }else{
  const char *attrs[]={"printer-is-accepting-jobs","document-format-supported","media-supported","print-color-mode-supported","pwg-raster-document-type-supported","pwg-raster-document-resolution-supported"};
  ippAddStrings(req,IPP_TAG_OPERATION,IPP_TAG_KEYWORD,"requested-attributes",6,NULL,attrs);
 }
 /* cupsDoFileRequest retries. Use the documented streaming API instead;
  * no retry after ANY document bytes are written, even on timeout. */
 http_status_t hs=cupsSendRequest(http,req,resource,ippLength(req)+length);
 if(file){
  unsigned char buf[16384];size_t n;
  if(hs==HTTP_STATUS_CONTINUE)while((n=fread(buf,1,sizeof(buf),file))>0){hs=cupsWriteRequestData(http,(char*)buf,n);if(hs!=HTTP_STATUS_CONTINUE)break;}
  if(ferror(file))hs=HTTP_STATUS_ERROR;
  fclose(file);
 }
 ipp_t *r=(hs==HTTP_STATUS_CONTINUE||hs==HTTP_STATUS_OK)?cupsGetResponse(http,resource):NULL;
 ippDelete(req);
 if(!r||ippGetStatusCode(r)!=IPP_STATUS_OK){if(r)ippDelete(r);httpClose(http);return die();}
 if(check){
  ipp_attribute_t *a=ippFindAttribute(r,"printer-is-accepting-jobs",IPP_TAG_BOOLEAN);
  int ok=a&&ippGetBoolean(a,0)&&contains(r,"document-format-supported",IPP_TAG_MIMETYPE,"image/pwg-raster")&&contains(r,"media-supported",IPP_TAG_KEYWORD,"iso_a4_210x297mm")&&contains(r,"print-color-mode-supported",IPP_TAG_KEYWORD,"monochrome")&&contains(r,"pwg-raster-document-type-supported",IPP_TAG_KEYWORD,"sgray_8");
  int dpi=0; a=ippFindAttribute(r,"pwg-raster-document-resolution-supported",IPP_TAG_RESOLUTION);
  for(int i=0;a&&i<ippGetCount(a);i++){int y;ipp_res_t u;int x=ippGetResolution(a,i,&y,&u);if(x==300&&y==300&&u==IPP_RES_PER_INCH)dpi=1;}
  printf("{\"ready\":%s}\n",ok&&dpi?"true":"false");
 }else if(cancel){puts("{\"cancelAccepted\":true}");}
 else{
  int id=integer(r,"job-id",0),sheets=integer(r,"job-media-sheets-completed",-1);
  ipp_attribute_t *a=ippFindAttribute(r,"job-state",IPP_TAG_ENUM);int state=a?ippGetInteger(a,0):0;
  if(status){a=ippFindAttribute(r,"job-name",IPP_TAG_NAME);const char *actual=a?ippGetString(a,0,NULL):NULL;if(!actual||strcmp(actual,name)){ippDelete(r);httpClose(http);return die();}}
  printf("{\"jobId\":%d,\"state\":%d,\"sheets\":%d}\n",id,state,sheets);
 }
 ippDelete(r);httpClose(http);return 0;
}
