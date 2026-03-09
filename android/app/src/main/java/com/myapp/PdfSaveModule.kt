package com.myapp

import android.app.Activity
import android.content.Intent
import android.content.ActivityNotFoundException
import android.net.Uri
import androidx.core.content.FileProvider
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileInputStream

class PdfSaveModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  private var pendingPromise: Promise? = null
  private var pendingSourcePath: String? = null

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = "PdfSaveModule"

  @ReactMethod
  fun savePdfWithPicker(sourcePath: String, suggestedName: String, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "No active Activity available.")
      return
    }

    if (pendingPromise != null) {
      promise.reject("IN_PROGRESS", "A save operation is already in progress.")
      return
    }

    val sourceFile = File(sourcePath)
    if (!sourceFile.exists()) {
      promise.reject("SOURCE_NOT_FOUND", "PDF source file not found.")
      return
    }

    val safeName = if (suggestedName.endsWith(".pdf")) suggestedName else "$suggestedName.pdf"

    pendingPromise = promise
    pendingSourcePath = sourcePath

    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "application/pdf"
      putExtra(Intent.EXTRA_TITLE, safeName)
    }

    try {
      activity.startActivityForResult(intent, REQUEST_CODE_CREATE_DOCUMENT)
    } catch (error: Exception) {
      clearPending()
      promise.reject("PICKER_OPEN_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun openPdfInExternalApp(filePath: String, promise: Promise) {
    val file = File(filePath)
    if (!file.exists()) {
      promise.reject("FILE_NOT_FOUND", "PDF file not found.")
      return
    }

    val uri = FileProvider.getUriForFile(
      reactContext,
      "${reactContext.packageName}.fileprovider",
      file
    )

    val intent = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(uri, "application/pdf")
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }

    try {
      val chooserIntent = Intent.createChooser(intent, "Open PDF").apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      val activity = reactContext.currentActivity
      if (activity != null) {
        activity.startActivity(chooserIntent)
      } else {
        reactContext.startActivity(chooserIntent)
      }
      promise.resolve(true)
    } catch (error: ActivityNotFoundException) {
      promise.reject("NO_APP", "No app available to open PDF.", error)
    } catch (error: Exception) {
      promise.reject("OPEN_FAILED", error.message, error)
    }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQUEST_CODE_CREATE_DOCUMENT) {
      return
    }

    val promise = pendingPromise ?: return
    val sourcePath = pendingSourcePath

    if (resultCode != Activity.RESULT_OK) {
      clearPending()
      promise.reject("CANCELLED", "Save cancelled.")
      return
    }

    if (sourcePath == null) {
      clearPending()
      promise.reject("SOURCE_MISSING", "Pending source path missing.")
      return
    }

    val destinationUri: Uri = data?.data ?: run {
      clearPending()
      promise.reject("DESTINATION_MISSING", "No destination selected.")
      return
    }

    try {
      FileInputStream(File(sourcePath)).use { input ->
        reactContext.contentResolver.openOutputStream(destinationUri)?.use { output ->
          input.copyTo(output)
        } ?: throw IllegalStateException("Cannot open destination stream.")
      }

      clearPending()
      promise.resolve(destinationUri.toString())
    } catch (error: Exception) {
      clearPending()
      promise.reject("SAVE_FAILED", error.message, error)
    }
  }

  override fun onNewIntent(intent: Intent) = Unit

  private fun clearPending() {
    pendingPromise = null
    pendingSourcePath = null
  }

  companion object {
    private const val REQUEST_CODE_CREATE_DOCUMENT = 58021
  }
}
