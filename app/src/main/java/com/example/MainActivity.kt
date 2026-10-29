package com.example

import android.annotation.SuppressLint
import android.app.PictureInPictureParams
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Rational
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PictureInPictureAlt
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.example.ui.theme.MyApplicationTheme
import com.example.ui.theme.TacticalDark

class MainActivity : ComponentActivity() {

    private var isInPipMode by mutableStateOf(false)
    private var webViewRef: WebView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            MyApplicationTheme(darkTheme = true) {
                var canGoBack by remember { mutableStateOf(false) }

                BackHandler(enabled = canGoBack) {
                    webViewRef?.goBack()
                }

                Scaffold(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(TacticalDark),
                    contentWindowInsets = WindowInsets(0, 0, 0, 0)
                ) { innerPadding ->
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(innerPadding)
                    ) {
                        ShopeeHUDWebView(
                            isInPip = isInPipMode,
                            onWebViewCreated = { wv ->
                                webViewRef = wv
                            },
                            onCanGoBackChanged = { backAvailable ->
                                canGoBack = backAvailable
                            },
                            onRequestPip = {
                                enterPipMode()
                            }
                        )

                        // If not in PiP, provide floating PiP button for easy 1-touch overlay over Shopee
                        if (!isInPipMode) {
                            FloatingActionButton(
                                onClick = { enterPipMode() },
                                modifier = Modifier
                                    .align(Alignment.BottomEnd)
                                    .padding(end = 16.dp, bottom = 28.dp)
                                    .testTag("native_pip_fab"),
                                containerColor = MaterialTheme.colorScheme.primary,
                                contentColor = MaterialTheme.colorScheme.onPrimary
                            ) {
                                Icon(
                                    imageVector = Icons.Default.PictureInPictureAlt,
                                    contentDescription = "Bật Cửa Sổ Nổi PiP Đè Shopee"
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: Configuration
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        isInPipMode = isInPictureInPictureMode
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        // Automatically enter PiP when pressing Home if user opened the HUD
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            enterPipMode()
        }
    }

    fun enterPipMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                val aspectRatio = Rational(16, 9)
                val params = PictureInPictureParams.Builder()
                    .setAspectRatio(aspectRatio)
                    .build()
                enterPictureInPictureMode(params)
            } catch (e: Exception) {
                // Fallback for older configurations
            }
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun ShopeeHUDWebView(
    isInPip: Boolean,
    onWebViewCreated: (WebView) -> Unit,
    onCanGoBackChanged: (Boolean) -> Unit,
    onRequestPip: () -> Unit
) {
    val context = LocalContext.current

    AndroidView(
        modifier = Modifier
            .fillMaxSize()
            .testTag("main_webview"),
        factory = { ctx ->
            WebView(ctx).apply {
                settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    databaseEnabled = true
                    allowFileAccess = true
                    mediaPlaybackRequiresUserGesture = false
                    cacheMode = WebSettings.LOAD_DEFAULT
                    useWideViewPort = true
                    loadWithOverviewMode = true
                }

                // Inject Native Android Bridge
                addJavascriptInterface(
                    AndroidBridge(ctx, onRequestPip),
                    "AndroidBridge"
                )

                webChromeClient = WebChromeClient()
                webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView?, url: String?) {
                        super.onPageFinished(view, url)
                        onCanGoBackChanged(view?.canGoBack() == true)
                    }
                }

                loadUrl("file:///android_asset/shopee_hud/index.html")
                onWebViewCreated(this)
            }
        },
        update = { webView ->
            // In PiP mode, send message to Webview or adjust view if needed
            if (isInPip) {
                webView.evaluateJavascript(
                    """
                    (function() {
                      const tabs = document.querySelectorAll('.nav-tab');
                      if (tabs && tabs[2]) tabs[2].click(); // Focus on Module 2 Canvas/Clock
                    })();
                    """.trimIndent(),
                    null
                )
            }
        }
    )
}

/**
 * Android bridge for Web Audio/Vibration & Native PiP requests
 */
class AndroidBridge(
    private val context: Context,
    private val onPipRequested: () -> Unit
) {
    @JavascriptInterface
    fun requestPictureInPicture() {
        onPipRequested()
    }

    @JavascriptInterface
    fun vibrate(patternStr: String) {
        try {
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vibratorManager?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }

            if (vibrator != null && vibrator.hasVibrator()) {
                val parts = patternStr.split(",").mapNotNull { it.trim().toLongOrNull() }
                if (parts.isNotEmpty()) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        val timings = parts.toLongArray()
                        val effect = VibrationEffect.createWaveform(timings, -1)
                        vibrator.vibrate(effect)
                    } else {
                        @Suppress("DEPRECATION")
                        vibrator.vibrate(parts.toLongArray(), -1)
                    }
                }
            }
        } catch (_: Exception) {}
    }
}
