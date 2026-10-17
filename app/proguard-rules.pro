# Preserve source file and line numbers for readable crash reports in CrashActivity
-keepattributes SourceFile,LineNumberTable
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# Keep WebView JavascriptInterface methods in AndroidJS
-keepclassmembers class top.rootu.lampa.AndroidJS {
    @android.webkit.JavascriptInterface <methods>;
    public *;
}

# Keep Gson serialized models and data classes
-keep class top.rootu.lampa.models.** { *; }
-keep class top.rootu.lampa.tmdb.models.** { *; }
-keep class top.rootu.lampa.PlayerStateManager$* { *; }
-keep class top.rootu.lampa.helpers.Prefs$InputHistory { *; }
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# Keep Rhino PAC script parser static helper methods invoked via reflection from JS scope
-keep class com.btr.proxy.selector.pac.** { *; }
-keep class org.mozilla.javascript.** { *; }
-dontwarn org.mozilla.javascript.**
-dontwarn java.beans.**
-dontwarn java.lang.management.**

# Keep custom View constructors inflated from XML
-keepclassmembers class * extends android.view.View {
    public <init>(android.content.Context);
    public <init>(android.content.Context, android.util.AttributeSet);
    public <init>(android.content.Context, android.util.AttributeSet, int);
}

# Desugared / Java 8+ library warnings
-keep class j$.util.** { *; }
-dontwarn j$.util.**
