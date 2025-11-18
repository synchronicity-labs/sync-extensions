API Collection
Workflow Extensions
Integrate your app’s workflow within the Final Cut Pro interface to streamline data exchange.
Overview
When your app supports workflows that require users to exchange data between your app and Final Cut Pro, consider adding a workflow extension to your app. A workflow extension is not a replacement for your app; it’s an extension of the app’s functionality, made available within the Final Cut Pro interface. When a user’s workflow requires frequent switching between your app and the Final Cut Pro interface, having your app’s functionality within the interface provides a seamless user experience.

You must use a macOS app to contain and deliver your workflow extension. The app that contains the extension is called the container app.

When a user launches an extension, Final Cut Pro hosts the extension in its interface, inside a floating window, and becomes the host app. However, the amount of information a workflow extension presents in a floating window space may not be sufficient for complex tasks. Create an extension for workflows that are optimized for limited screen size; for example, managing media files, and browsing and accessing stock footage. Delegate time-consuming or complicated tasks to the container app.

Screenshot showing a workflow extension inside a floating window in the Final Cut Pro interface.

You can extend a workflow extension’s functionality beyond data exchange by using the libraries provided in the Workflow Extension SDK. The libraries facilitate a workflow extension’s interaction and communication with the Final Cut Pro timeline. You can use the APIs in the SDK to support workflows that allow users to collaborate in real time on a project opened in both Final Cut Pro and the workflow extension.

Topics
Essentials
Designing Workflow Extensions
Follow these design guidelines to provide a unique experience to workflow extension users.
Building a Workflow Extension
Create a workflow extension in Xcode by using the Final Cut Pro Workflow Extension template.
Information Property List Keys
ProExtensionPrincipalViewControllerClass
The name of the principal view controller class of your extension.
ProExtensionAttributes
A dictionary that specifies the minimum size of the floating window in which Final Cut Pro hosts the extension view.
FCPX Interactions
Interacting with the Final Cut Pro Timeline
Extend your workflows beyond media exchange by enabling a workflow extension to interact with the Final Cut Pro timeline.
protocol FCPXHost
A protocol that provides an interface to retrieve the Final Cut Pro timeline proxy objects and details of the host app.
func ProExtensionHostSingleton() -> (any NSObjectProtocol)?
Returns the singleton proxy instance of the host object.
class FCPXTimeline
An interface that has methods and properties to communicate and interact with the Final Cut Pro timeline.
protocol FCPXTimelineObserver
An interface with optional methods implemented by observers of FCPXTimeline objects.
FCPX Timeline Proxy Objects
class FCPXObject
An abstract superclass for Final Cut Pro timeline proxy objects.
enum FCPXObjectType
The Final Cut Pro timeline object types.
class FCPXLibrary
An object that contains details of a Final Cut Pro library.
class FCPXEvent
An object that contains details of an event in the Final Cut Pro library.
class FCPXProject
An object that contains details of a project with the sequence open in the Final Cut Pro timeline.
class FCPXSequence
An object that contains details of a sequence that’s open in the Final Cut Pro timeline.
enum FCPXSequenceTimecodeFormat
The display format of the sequence timecode.

Content and Metadata Exchanges with Final Cut Pro
Send media assets and timeline sequences to Final Cut Pro for editing, and receive rendered media and editing decisions in your app.
Overview
Help your users exchange data between Final Cut Pro and your app, and avoid unwieldy manual processes. With FCPXML representing media, metadata, and Final Cut Pro items, your users can send data from your app to Final Cut Pro for editing, or receive rendered media (movies) and editing decisions from Final Cut Pro projects in your app for further processing.

Illustration showing a two-way flow of data between Final Cut Pro and your app, with the Final Cut Pro icon and X M L (to indicate FCPXML) in the middle.

FCPXML is a specialized format that uses XML elements to describe the data going between your app and Final Cut Pro. With FCPXML simplifying the data exchange, app users can:

Send large quantities of media from an asset management tool to be edited in Final Cut Pro.

Send media clips—annotated with ratings, keywords, and metadata—and let Final Cut Pro organize the incoming media.

Receive rendered media and editing decisions for a project—including lists of media used—from Final Cut Pro for further processing, such as color grading and correction.

Receive rendered media (movies) in an app to finish and package for delivery, playout, or archiving.

Record an audio/video stream and start editing the media in Final Cut Pro while the file is still being recorded.

Topics
Data Sent from Your App to Final Cut Pro
Sending Media and Metadata to Final Cut Pro
Send media assets, timeline sequences, and metadata from your app to Final Cut Pro.
Supporting Drag and Drop for Data Sent to Final Cut Pro
Add drag and drop support so your users can drag media assets and timeline sequences from your app directly into Final Cut Pro.
Sending Data Programmatically to Final Cut Pro
Manage and streamline the sending of batches of media assets and timeline sequences from your app using Apple events.
Sending media to Final Cut Pro as it’s recorded
Designate media as a growing file to make it available to users while it’s still being recorded.
Data Received in Your App from Final Cut Pro
Supporting Drag and Drop to Receive Final Cut Pro Data
Add drag and drop support in your app to give users an intuitive way to receive clips, projects, and other items from Final Cut Pro.
Receiving Media and Data Through a Custom Share Destination
Receive rendered media (movies), editing descriptions for project timelines, library archives, and FCPXML for other Final Cut Pro items in your app.

Building a Workflow Extension
Create a workflow extension in Xcode by using the Final Cut Pro Workflow Extension template.
Overview
When you are ready to develop a workflow extension, build it using the Xcode template that comes with the Workflow Extension SDK. The Xcode template packages the extension code in a specific manner (.appex) and embeds it in an app bundle. When a user installs the app containing your extension, macOS registers the workflow extension, and Final Cut Pro makes the extension available in its interface.

Install the Workflow Extension SDK
Download and install the Workflow Extension SDK from Apple’s developer website.

Run the installer that comes with the Workflow Extension SDK. It installs the relevant frameworks and the Xcode template in the appropriate locations on your computer.

Add a Workflow Extension Target to Your Project
You create and configure the workflow extension as a separate target alongside your app. Start by launching Xcode and opening your existing macOS app project. Then choose File > New > Target, select the Final Cut Pro Workflow Extension template from the Workflow Extension section of the macOS platform, and click Next, as shown in the following image.

Screenshot showing the Final Cut Pro Workflow Extension template location in the Xcode template window.

Enter a product name for your extension and set other options, like your organization name. Make sure that your app project is selected in the Project menu, and that your macOS app target is selected in the Embed in Application menu. Then click Finish.

The Xcode template sets up relevant build options and creates an initial set of project files for the workflow extension. A workflow extension template includes an Info.plist file, a view controller class, and a default user interface. With this initial set of files, you can build and run the project even before you customize the workflow extension code. During the build process, Xcode inserts the extension in the proper place in your app bundle, and you get a workflow extension bundle (ending in .appex) that runs in its own process.

Add Keys to the Info Property List Template
The default Info.plist file identifies your workflow extension and may specify some details about your extension under the NSExtension key.

  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.FinalCut.WorkfloWExtension</string>
    <key>ProExtensionPrincipalViewControllerClass</key>
    <string>MyExtensionViewController</string>
  </dict>
Also, if required, you can add keys to the Info.plist file to specify the minimum size of the floating window in which Final Cut Pro displays a workflow extension view.

For example, to limit the minimum size of the floating window to 100 x 100 pixels, add the following values to the Info.plist file under the ProExtensionAttributes key.

  <key>ProExtensionAttributes</key>
  <dict>
    <key>ContentViewMinimumWidth</key>
    <integer>100</integer>
    <key>ContentViewMinimumHeight</key>
    <integer>100</integer>
  </dict>
For more information, see Set a Minimum Floating Window Size.

Modify the Workflow Extension Principal Class
A workflow extension is essentially a view controller class for the view hosted in the Final Cut Pro interface. The Xcode template provides a subclass of NSViewController, which is the principal class that serves as the primary view controller of the workflow extension. When Final Cut Pro (the host app) invokes your extension, an operating system service instantiates this class.

The principal class has stubs for methods you can modify to customize the workflow in your extension. You can modify this class to act as an observer for changes in the Final Cut Pro timeline or to add support for drag and drop functionality.

When a user closes an extension’s floating window, the view controller invokes the viewWillDisappear() method of your extension’s principal class, and the view disappears from the window. Override the viewWillDisappear method to remove references to objects that you no longer need or anything you need to do when the view disappears. For example, you may use this method to stop an audio session or to manage any custom objects in your extension.

Enable and Verify Your Workflow Extension
To test your workflow extension before submitting it to the app store, you must enable it by installing the containing app in your /Application folder and launching the app once from there. This step makes Final Cut Pro recognize and display your extension in its interface.

To verify that your extension is available in Final Cut Pro, check the extension menu to see if it appears in the list of available extensions. Each menu item contains the localized name of the extension along with the extension icon. You can also get the list of available extensions from the Extensions item in the Window menu. Either way, when a user chooses an extension, Final Cut Pro loads it and displays its interface.

Note

Final Cut Pro displays an extension menu in its toolbar only if it has available workflow extensions.

Debug Your Workflow Extension
Debugging your workflow extension in Xcode is similar to debugging any other process in an Xcode debugger. You can connect the Xcode debugger to a workflow extension process before or after launching a workflow extension.

To connect the Xcode debugger before launching an extension, you attach the debugger to the extension by its name. Choose the Attach to Process by PID or Name option from the Xcode Debug menu.

To attach the Xcode debugger after launching the extension:

Invoke the extension from the Final Cut Pro interface.

From the Xcode menu, choose Debug > Attach to Process, then select the extension by name or from the list of running processes.

The Xcode debugger attaches to the extension’s process, sets active breakpoints, and lets the extension execute. At this point, you can use the same Xcode debugging features that you use to debug other processes.

Sending Media and Metadata to Final Cut Pro
Send media assets, timeline sequences, and metadata from your app to Final Cut Pro.
Overview
Make content in your app available to Final Cut Pro, whether it’s a timeline sequence from an asset-management app or raw footage from video capture software. With FCPXML, your users have options for getting data from your app to Final Cut Pro for editing. Your app can send media assets as Final Cut Pro clips, events, projects, and other items. An FCPXML document can also contain markers, ratings, keywords, keyword collections, and metadata.

Illustration showing the types of items users can send from your ap to Final Cut Pro using F C P X M L.

Choose How to Send Data to Final Cut Pro
Send your users’ data to Final Cut Pro based on how much and what kind of data they have to send, how often they need to send it, and how they approach their tasks. For example:

If your users often send small batches of individual clips to different areas of Final Cut Pro and go back and forth frequently between your app and Final Cut Pro, set up drag and drop in your app to make sending media to Final Cut Pro more intuitive. See Supporting Drag and Drop for Data Sent to Final Cut Pro.

If your users have a lot of assets to edit, and their workflow has them send everything to Final Cut Pro before starting to edit, use Apple events to help them manage that workflow more efficiently. See Sending Data Programmatically to Final Cut Pro.

If your users want to send media to Final Cut Pro for editing while they’re recording it, make sure your app designates the file as a growing file. You can then choose how to send the growing media file to Final Cut Pro. See Sending media to Final Cut Pro as it’s recorded.

Create an FCPXML Document
No matter how your app sends content to Final Cut Pro, it must create an FCPXML document to describe your users’ data. FCPXML—an XML-based language—describes the media, metadata, and timeline sequences (rough cuts as well as more-polished sequences) in terms that Final Cut Pro understands. Using FCPXML, your app can also take advantage of Final Cut Pro features, such as keywords, and use metadata to set up content for your users to edit. For more information, see Creating FCPXML Documents.


Article
Supporting Drag and Drop for Data Sent to Final Cut Pro
Add drag and drop support so your users can drag media assets and timeline sequences from your app directly into Final Cut Pro.
Overview
Enable drag and drop in your app so your users can drag media assets (or media assets as clips) directly to the Final Cut Pro sidebar, browser, or timeline. For example, if your users frequently send small batches of individual clips to different areas in Final Cut Pro, and often go back and forth between your app and Final Cut Pro, supporting drag and drop can make that process more intuitive.

Drag and drop operations use a pasteboard as the standardized mechanism for exchanging data between apps.

Illustration showing the drag and drop movement of an F C P X M L file from your app through a pasteboard to Final Cut Pro.

When your users start dragging items from your app, it creates a promise — a commitment to provide a data representation — in the drag pasteboard. When users drop the assets into Final Cut Pro, Final Cut Pro retrieves the content of the promise, and the operating system requests the FCPXML document from your app. Your app returns the FCPXML document that represents the dragged asset.

Tip

For information about creating an FCPXML document, see Creating FCPXML Documents; for examples of FCPXML that describe Final Cut Pro objects, see Describing Final Cut Pro Items in FCPXML.

Pasteboard Types and Versions
Final Cut Pro supports a generic XML pasteboard type identified by the string com.apple.finalcutpro.xml. Starting in Final Cut Pro 10.5, DTD version 1.8 and later supports version-specific pasteboard types — such as, com.apple.finalcutpro.xml.v1-8, com.apple.finalcutpro.xml.v1-9, or com.apple.finalcutpro.xml.v1-10. Final Cut Pro looks for the version-specific pasteboard type with the highest version number and requests the XML associated with it. If there is no version-specific pasteboard type, Final Cut Pro finds the generic XML pasteboard type and requests the XML. When sending XML to your app, Final Cut Pro always writes XML for the current DTD version to the generic pasteboard type and the appropriate XML to each versioned pasteboard type.

For maximum compatibility, make sure your app supports the generic XML pasteboard type, that is, XML for the current DTD version as of your app’s release. It is also recommended that your app supports the versioned pasteboard types for the current and previous DTD versions as of your app’s release. Supporting these versions ensure that you take advantage of XML features for the highest DTD version supported by the user’s Final Cut Pro version.

Create a Promise in the Pasteboard
The specific steps to enable drag and drop in your app depend on your app’s design and purpose and include tasks such as adding support to the views in your app and implementing delegate methods. For details and more explanation about the steps for enabling drag and drop, see Drag and Drop in the AppKit framework.

When your app is ready to support drag and drop, use the following code snippet to create a promise. In the drag handler, instantiate your custom item-provider class that implements the NSPasteboardItemDataProvider protocol. Create a pasteboard item and set your custom item provider to it with the payload types you intend to support. You can then write the pasteboard item to the drag pasteboard. For more information, see NSPasteboardItem.

Swift
Objective-C
let itemProvider = YourItemProvider(data: selection)
let item = NSPasteboardItem()    
//Set supported pasteboard types
let supportedPasteboardTypes = ["com.apple.finalcutpro.xml.v1-10", "com.apple.finalcutpro.xml.v1-9", "com.apple.finalcutpro.xml"]
    .map { NSPasteboard.PasteboardType($0) }
let isOK = item.setDataProvider(itemProvider, forTypes: supportedPasteboardTypes)
if isOK {
    draggingPasteboard.writeObjects([item])
}
Respond to Final Cut Pro and Return FCPXML
Once your user drops the dragged items into Final Cut Pro, Final Cut Pro takes over. It retrieves the data from the promise you created in the pasteboard, which invokes the NSPasteboardItemDataProvider protocol method in your app. (The method is expected to return FCPXML.)

Use the following code as a guide to implement the NSPasteboardItemDataProvider protocol method on your app’s custom pasteboard item provider class and return the FCPXML.

Swift
Objective-C
func pasteboard(_ pasteboard: NSPasteboard?, item: NSPasteboardItem, provideDataForType type: NSPasteboard.PasteboardType) {
    let supportedPasteboardTypes = ["com.apple.finalcutpro.xml.v1-10", "com.apple.finalcutpro.xml.v1-9", "com.apple.finalcutpro.xml"]
    .map { NSPasteboard.PasteboardType($0) }
    guard supportedPasteboardTypes.contains(type) else { return }
    let document = itemData.newXMLDocument(forPasteboardType: type)
    let options: XMLDocument.Options = [.nodeCompactEmptyElement, .nodePrettyPrint]
    let data = document.xmlData(options: options)
    item.setData(data, forType: type)
}
Final Cut Pro validates the document type and the DTD version in the returned FCPXML, and then creates the objects it describes. If there are naming conflicts between new and existing objects, Final Cut Pro handles those conflicts according to the rules described in the following table.

When users drag a file containing

Final Cut Pro does the following

One or more events to a library in the Final Cut Pro sidebar

Adds the events to the library. If the library already contains an event with the same name, Final Cut Pro merges the content of the new event with the content in the existing event.

One or more clips to a Final Cut Pro timeline

Adds the clips to the event containing the project that’s open in the timeline. Final Cut Pro then inserts the clips onto the timeline at the point where the user dropped them.

One or more event items, consisting of any combination of clips and projects with their associated metadata, into an event in the Final Cut Pro sidebar or browser

Adds the items to the event. If the event already contains an item of the same type with the same name, Final Cut Pro prompts the user to either replace the existing item or keep both. (If the user chooses to keep both, Final Cut Pro creates a unique name for the incoming item by adding a numerical suffix to the item’s name.)

One or more event items to a library in the Final Cut Pro sidebar

Final Cut Pro creates an event with the name of today’s date, as in 06-25-19. If an event with that name already exists, Final Cut Pro adds a numeric suffix to create a unique name, as in 06-25-19 1, and adds the items to the event.

The type of object being dragged determines where it can be dropped. Final Cut Pro won’t accept a dragged item unless that item is allowed in the drop destination. For example, your users can drag clips into an event, but they can’t drag an event into a smart collection.

Sending Data Programmatically to Final Cut Pro
Manage and streamline the sending of batches of media assets and timeline sequences from your app using Apple events.
Overview
Consider using Apple events to help your users manage their workflow if they have many assets to send to Final Cut Pro and generally send all of those assets before starting their work in Final Cut Pro. With Apple event support in your app, your users need fewer clicks to send their media assets, projects, and metadata to Final Cut Pro for editing.

To provide a more streamlined process, use the Open Document Apple event to send an FCPXML document to Final Cut Pro and trigger the process with a button or menu item in your app.

Illustration showing movement of Final Cut Pro X M L document from your app through an Apple event to Final Cut Pro.

Create and Save an FCPXML File
Before your app can use Apple events to send a file to Final Cut Pro, it must create the FCPXML document, and save it as a file with an .fcpxml extension. See Creating FCPXML Documents.

Consider saving the .fcpxml file to a temporary location that your app clears periodically. Once Final Cut Pro processes the FCPXML, it no longer needs the actual .fcpxml file.

Send an FCPXML File Using an Apple Event
To communicate your app’s request, create an AppleScript that sends an Open Document Apple event to Final Cut Pro. This Apple event contains a URL that points to an .fcpxml file your app created, and it tells Final Cut Pro to open and process that file.

Use the following AppleScript to send an Open Document Apple event containing the URL to an FCPXML file called MyEvents.fcpxml:

tell application "Final Cut Pro"
    activate
    open POSIX file "/Users/JohnDoe/Documents/UberMAM/MyEvents.fcpxml"
end tell
Use the following code to execute the AppleScript script created in the previous example:

Swift
Objective-C
// the scriptSourceToSend property contains the AppleScript source above
let script = NSAppleScript(source: scriptSourceToSend)
var errorInfo: NSDictionary? = nil
let result = script?.executeAndReturnError(&errorInfo)
if result == nil { /* handle error */ }
AppleScript is the preferred way to send an FCPXML document to Final Cut Pro using the Open Document Apple event. AppleScript lets Final Cut Pro identify the app that’s sending the request, which means Final Cut Pro can provide that information when it reports an error or prompts for user action. The result is a better experience for your users. If you prefer, however, you can use NSWorkspace instead of AppleScript. (See the NSWorkspace developer documentation for details.)

Specify a Library for the FCPXML File
When your app sends an FCPXML file to Final Cut Pro using an Apple event, Final Cut Pro displays the Open Library dialog so your user can choose where the content should go. Users can choose an existing library (or event) or create a new one.

You can also specify the location of the library as a URL by adding the import option to your FCPXML document. You can even have your app prompt users for the location of the library and add that information as the import option when it creates your FCPXML document. If no library exists at the location specified in the FCPXML file, Final Cut Pro creates a new one and gives it the default library name. For more information, see import-options.

Once Final Cut Pro determines a library for the data, it processes the FCPXML document and populates the content according to the following rules.

If an FCPXML document contains

Final Cut Pro does the following

One or more clips or projects

Final Cut Pro creates a new event in the specified library named with today’s date, as in 06-29-19. Final Cut Pro then imports all items into the new event by copying or linking to the source data. (If an event with the same name already exists, Final Cut Pro adds a numerical suffix to the new event name to keep names unique, as in 06-29-19 1.)

Events

Final Cut Pro puts the events into the specified library, merging events with the same name. (If items within the merged events have the same name, Final Cut Pro asks the user whether to replace the existing item with the new item or keep both. If a user keeps both, Final Cut Pro adds a numerical suffix to the new item name to keep names unique.

A library

Final Cut Pro merges all the content into the specified library. Any naming conflicts between new and existing items are handled using the previous rules.


Sending media to Final Cut Pro as it’s recorded
Designate media as a growing file to make it available to users while it’s still being recorded.
Overview
Your users may want to start using a media file in Final Cut Pro even while your app continues recording a video stream into the same file. Before recording begins, your app should designate the file as a growing file — a file that continues to have media added to it. How to make this designation depends on the file format being used for the recording. Final Cut Pro supports editing growing media files in both QuickTime Movie and Material eXchange Format (MXF) file formats.

After your app sends a growing file to Final Cut Pro, Final Cut Pro periodically checks the file’s modification date. If Final Cut Pro determines that the file has been modified, it reads the file again. Once a file has been designated as a growing file, your users can drag it to Final Cut Pro (if your app supports drag and drop functionality) or your app can use an Apple event to send the growing file to Final Cut Pro programmatically. See Supporting Drag and Drop for Data Sent to Final Cut Pro and Sending Data Programmatically to Final Cut Pro.

Designate a QuickTime Movie as a Growing File
A QuickTime Movie normally uses a consolidated table of contents that allows random access to media. However, to edit a QuickTime Movie while recording it, the movie must be created using movie fragments, which uses a distributed table of contents for the file. A distributed table of contents lets Final Cut Pro access the media file while content is still being added.

To create a QuickTime Movie that lets your users work on the file as it’s being recorded:

Record the movie using movie fragments. (See “Working with Fragmented Movies” in AVAsset.)

Set the movieFragmentInterval property in the AVAssetWriter class instance that’s writing the media file to a value between 15 and 30 seconds. Or, if you’re recording with a connected device, set that same property (movieFragmentInterval) in the AVCaptureMovieFileOutput class instance.

Designate Media in an MXF File Format as a Growing File
If your app records media in an MXF file, and you want your users to be able to use the media in Final Cut Pro while recording, your app must specify the duration of the recorded file as "unknown".

For information about recording in MXF format, see the ST 377-1:2011 - SMPTE Standard - Material Exchange Format (MXF) - File Format Specification.


Supporting Drag and Drop to Receive Final Cut Pro Data
Add drag and drop support in your app to give users an intuitive way to receive clips, projects, and other items from Final Cut Pro.
Overview
Drag and drop is a good choice for receiving data when your users need to transfer a relatively small number of items from Final Cut Pro to your app. If your users often go back and forth between Final Cut Pro and your app as they receive data from Final Cut Pro, supporting drag and drop in your app could streamline that workflow by letting them drag items directly from the Final Cut Pro sidebar or browser to your app.

Tip

If you want your users to be able to send rendered media (movies) to your app, set up a custom share destination. (See Receiving Media and Data Through a Custom Share Destination.)

Drag and drop operations use a pasteboard as the standardized mechanism for exchanging data between apps.

Illustration showing an F C P X M L document moving from Final Cut Pro to your app using the pasteboard. 

Once your user selects objects in the Final Cut Pro sidebar or browser and starts dragging them, Final Cut Pro creates a promise—a commitment to provide a data representation—in the dragging pasteboard. When your user drops the dragged objects into your app, your app requests the content of the promise. Final Cut Pro fulfills the request by putting the FCPXML for the dragged objects into the pasteboard. Your app retrieves the FCPXML and creates the objects in your app.

For information on versioned pasteboard types, see Pasteboard Types and Versions.

Note

When your users drag an object from Final Cut Pro to your app, only the metadata in the currently selected metadata view is included in the FCPXML. Users can change the metadata view in Final Cut Pro before they drag data to your app. For more information, see Intro to metadata in Final Cut Pro.

Receive Pasteboard Data
When receiving XML, your app can begin checking the available types on the pasteboard to request the most appropriate type; typically the highest versioned pasteboard type your app supports. Requesting a versioned pasteboard type ensures that your app continues to function as expected if a user updates to a new version of Final Cut Pro, with a newer DTD version, before updating your app. Order the pasteboard types your app supports by priority. Then you can iterate through your app’s sorted pasteboard types and select the first type available on the pasteboard. The following code snippet shows how you can do this in your app.

Swift
Objective-C
let sortedPasteboardTypes = ["com.apple.finalcutpro.xml.v1-10", "com.apple.finalcutpro.xml.v1-9", "com.apple.finalcutpro.xml"]
    .map { NSPasteboard.PasteboardType($0) }
for pasteboardType in sortedPasteboardTypes {
    guard let availableTypes = pasteboard.types, availableTypes.contains(pasteboardType),
          let data = pasteboard.data(forType: pasteboardType) else { continue }
    do {
        let document = try XMLDocument(data: data, options: [])
        parseXMLDocument(document)
    } catch let error {
        print(error)
    }
    break
}
The organization of the FCPXML document depends on what your users drag out of Final Cut Pro:

When users drag

The FCPXML from Final Cut Pro includes

One or more events from the Final Cut Pro sidebar

The contents of the dragged events. Each event can contain multiple projects and clips; each project contains editing decisions and can include markers; and each clip can include keywords and ratings. (Information about the library that contains the events is not included.)

One or more items (projects and clips) in the Final Cut Pro browser

The contents of the dragged projects and clips. Each project contains editing decisions, along with any markers. Each clip can include keywords and ratings. (Information about the events that contain those items is not included.)

A single library from the Final Cut Pro sidebar

The contents of the entire library. The library can contain multiple events, which could contain multiple projects (with editing decisions and possibly with markers) and clips (possibly with keywords and ratings).

In each case, metadata associated with the media assets (and in the selected metadata view) are available in the Resource section of the FCPXML document (See Structure Your FCPXML Document for more details.)

You may decide to design your app so that it accepts only certain types of Final Cut Pro objects in specific areas. For example, one part of your app might accept events, while another part might accept only clips.


Receiving Media and Data Through a Custom Share Destination
Receive rendered media (movies), editing descriptions for project timelines, library archives, and FCPXML for other Final Cut Pro items in your app.
Overview
After your users have finished working on their project in Final Cut Pro, they’re ready to bring it over to your app for final processing. Maybe your users plan to upload their project to an asset management server, or perhaps they need to archive or catalog the entire Final Cut Pro library.

With a Final Cut Pro custom share destination (and support from your app), your users can receive rendered output from a Final Cut Pro project, along with FCPXML descriptions for the project’s editing decisions and other items, such as keywords, ratings, and markers. Your app can also request a copy of the library containing these items to use for archiving.

Illustration showing a Final Cut Pro custom share destination sending both FCPXML and QuickTime Movies to your app.

In Final Cut Pro, a share destination provides a set of preconfigured export settings. When a user shares one or more projects or clips, these settings determine the format and other characteristics of the exported media. A custom share destination serves a similar purpose, but it specifies an app that knows how to interact with Final Cut Pro as the target application in the Final Cut Pro export settings.

Once you set up a custom share destination for your users, they see the custom share destination you created as one of the choices for sharing a project in Final Cut Pro.

Screenshot showing File > Share menus with the custom share destination called MyAppCustomDestination selected.

Setting up your app is the first step in providing a custom share destination for your users. Edit your app’s Info.plist file to indicate that your app is capable of interacting with Final Cut Pro to configure the share operation (see Signal Your App’s Capabilities). Supply the scripting definitions required by Final Cut Pro to interact with your app through Apple events (see Describe Your Scripting Terminology) and add support so your app can respond to the series of Apple events sent by Final Cut Pro (see Provide Responses to Apple Events).

Once you’ve configured your app, create a custom share destination in Final Cut Pro. This is the destination that lets your users share their projects with your app (see Create a Custom Share Destination in Final Cut Pro). You distribute this custom share destination along with your app so users can add it to their own Final Cut Pro installation (see Distribute a Custom Share Destination to Your Users).

When your users have finished editing their projects in Final Cut Pro and want to continue their work in your app, they just select the project in Final Cut Pro, choose File > Share, and select your app’s custom share destination from the list of destinations. (See Intro to sharing projects in Final Cut Pro for more information.) Final Cut Pro conveys the request to your app, and your app responds with the information Final Cut Pro needs to perform the export operation.

Tip

When you create the custom share destination for your app in Final Cut Pro, use that opportunity to test the communications between Final Cut Pro and your app. As your own first user, you can identify and fix any bugs before you distribute the custom share destination file to your users.

Signal Your App’s Capabilities
Your app must advertise its ability to interact with Final Cut Pro and provide the information necessary for sharing a project. Add the following entry to the Info.plist file in your app’s bundle:

<key>com.apple.proapps.MediaAssetProtocol</key>
<dict>
</dict>
The value for this entry is an empty dictionary; the content is reserved for future use by Final Cut Pro.

Describe Your Scripting Terminology
Your app must supply scripting definitions for the events, object classes, and associated properties that Final Cut Pro uses to interact with your app. Specifically, your app must:

Create scripting definitions for events, object classes, and record types. This includes definitions for the asset class as a representation of the media in your app. It also includes the make event that Final Cut Pro sends to tell your app to create an asset object as a placeholder. (See Creating Scripting Definitions for Custom Share Destinations for the scripting definitions you need to provide.)

Implement the command-handler classes that are referenced from the scripting definitions. Specifically, implement the command handler for the make event using the Cocoa class name specified in your scripting definition. (See Cocoa Scripting Guide for more information.)

Implement the object classes and associated properties according to key-value coding (KVC) and other conventions. Specifically, implement the object class for the asset object class, using the Cocoa class name specified in the scripting definition. (See Cocoa Scripting Guide for details.) Cocoa Scripting support gets the properties’ values when Final Cut Pro asks for those properties through Get Property Apple events.

Provide Responses to Apple Events
Once Final Cut Pro confirms that your app can interact with it through Apple events, it sends your app a series of Apple events. Your app responds by telling Final Cut Pro what kind of data your users want to receive and by providing a location for the data. Specifically, Final Cut Pro uses Apple events to find out:

Whether your user wants to receive rendered media, editing decisions in FCPXML, or both

Whether your user wants a library archive

Which share metadata keys and values your user wants in the exported media files

Which DTD version to use for the exported media files

What Final Cut Pro metadata view to use to filter the metadata keys included in the exported media files

For information about responding to each of these Apple events, see Responding to Apple Events from Final Cut Pro.

Create a Custom Share Destination in Final Cut Pro
Once your app is set up to interact with Final Cut Pro, it’s time to create the actual share destination that your users will select in Final Cut Pro. (For more information, see Create share destinations in Final Cut Pro.)

Create a new custom share destination. In Final Cut Pro, choose File > Share > Add Destination. Drag the Export File destination from the right side of the Destinations list to the left side.

Give the new destination a name and specify the format and other settings. Choose the format your app requires and then specify the related settings, such as Video codec and Resolution. (For details about each option, see Export File destination in Final Cut Pro.)

Designate your app as the target application. From the “Open with” pop-up menu, choose Other. In the Applications folder, select your app and click Open.

Screenshot of the Destinations pane in Final Cut Pro Preferences. In the Destinations list on the left, MyAppCustomDestination is selected as the custom share destination for your app. The “Open with” field on the right shows MyApp as the target application. 

Distribute a Custom Share Destination to Your Users
Your users need the custom share destination you created for your app installed on their own systems so that it’s available in the list of share destinations in Final Cut Pro. (See Create share destinations in Final Cut Pro: Share destinations between Final Cut Pro users for more information.)

Select your custom share destination. In Final Cut Pro, choose Final Cut Pro > Preferences, select the Destinations pane, and then select the custom share destination for your app.

Drag your custom share destination to a location in the Finder. Final Cut Pro creates an .fcpxdest file for your custom share destination in that location.

When you’re ready to deliver the .fcpxdest file to your users (perhaps along with your app), instruct them to install the .fcpxdest file in Final Cut Pro in any of these ways:

Double-click the .fcpxdest file in the Finder.

Drag the .fcpxdest file to the Destinations pane in Final Cut Pro > Preferences.

Place the .fcpxdest file in either of the following locations:

/Library/Application Support/ProApps/Share Destinations/~/Library/Application Support/ProApps/Share Destinations/

Tip

You can use the Open Document Apple event to send your .fcpxdest file programmatically and have Final Cut Pro open it. Final Cut Pro will then install your custom share destination, making it available to your users. Use the steps in Send an FCPXML File Using an Apple Event, but substitute .fcpxdest file for the .fcpxml file.

