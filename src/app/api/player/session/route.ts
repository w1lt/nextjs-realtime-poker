import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    console.log("POST /api/player/session - Setting session cookie");

    const body = await request.json();
    const { token } = body;

    if (!token) {
      console.error("No token provided in request body");
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    console.log("Setting cookie with token:", token.substring(0, 20) + "...");

    // Set the session cookie
    const cookieStore = await cookies();
    cookieStore.set("player_session", token, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return NextResponse.json({ success: true, message: "Session cookie set" });
  } catch (error) {
    console.error("Error setting session cookie:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    console.log("GET /api/player/session - Getting session cookie");

    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("player_session");

    if (!sessionCookie) {
      console.log("No session cookie found");
      return NextResponse.json({ exists: false });
    }

    console.log(
      "Session cookie found:",
      sessionCookie.value.substring(0, 20) + "..."
    );

    return NextResponse.json({
      exists: true,
      value: sessionCookie.value.substring(0, 20) + "...", // Only return a truncated version for security
    });
  } catch (error) {
    console.error("Error getting session cookie:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    console.log("DELETE /api/player/session - Clearing session cookie");

    const cookieStore = await cookies();
    cookieStore.delete("player_session");

    return NextResponse.json({
      success: true,
      message: "Session cookie cleared",
    });
  } catch (error) {
    console.error("Error clearing session cookie:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
