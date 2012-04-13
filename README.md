Socketio-sync allows google docs type co-operative editing of textual data 
which can be integrated to various wysiwyg editors or e.g. simple text area.

Project focus is storing / tracking changes in textual data. System should be
content editor, not permanent storage.System just provides service for 
collaborative editing of certain content.

 1. Open session with initial document to edit 
 2. Allow people to join session (with same key or something like that?)
 3. After editing is done: get result and close session
 
TODO:
 - open session + init data/ check if session is open
 - sending patches to certain session
 - Authentication things (should be decided how...)
 - Store data to Redis during editing to prevent loosing 
   all sessions if server crashes
 - Revision history during session if something went wrong. 
   (show history / select where to reset)

Some areas where to improve current system:

= Conflict detection and preventing bad client from trashing document =

* Serverside sanity check for changeset
* e.g. CKEditor integration could validate that changed data passes ckeditor validators
* if big / suspicious change check from client verification that it was really wanted
* if verification not responded etc. just close client connection
* if some patch cannot be applied to document, patch sender will be sent conflict notification 
  and they can disconnect or reload document from server (document state out of sync)

= Caret position preserving =

* Currently in textarea caret position is stored before applying patch and 
  restored after (position is absolute from start of text area). Better would 
  be solution where position moves forward if text is added before caret. This 
  could be done by analyzing patch and modifying caret postions agains that, 
  however would be better to have more general solution to problem.

* In CKEditor implementation html markup is stripped to text only and caret 
  position is read from that.. this works really bad (obviously)

* Adding special tags to source which actually keeps caret position. This 
  system would allow showing cursor of other editors in each clients view, 
  but it would mean that every change in cursor position would cause also 
  change in document and that these extra tags woudl need to be removed from 
  final result. Anyways causing more small events for caret position changes 
  should not be a problem, those can be also reduced e.g. by making more 
  delay between sending diffs, how to implement showing / maintaining positions
  with tinymce / ckeditor might be tricky but surely can be done.
